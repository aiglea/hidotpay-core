import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';

import type { DepositObservation, DepositScanStore, ScanCursor } from './scanner.js';

export class PostgresDepositScanStore implements DepositScanStore {
  public constructor(private readonly pool: Pool) {}

  public async cursor(network: string): Promise<ScanCursor | undefined> {
    const result = await this.pool.query<{ block_hash: string; block_height: string }>(
      'SELECT block_height::STRING, block_hash FROM chain_scan_cursors WHERE network = $1',
      [network],
    );
    const row = result.rows[0];
    return row ? { blockHash: row.block_hash, height: Number(row.block_height) } : undefined;
  }

  public async saveCursor(network: string, cursor: ScanCursor): Promise<void> {
    await this.pool.query(
      `INSERT INTO chain_scan_cursors (network, block_height, block_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (network) DO UPDATE SET block_height = excluded.block_height, block_hash = excluded.block_hash, updated_at = now()`,
      [network, cursor.height, cursor.blockHash],
    );
  }

  public async assertNoOrphanedCredits(network: string): Promise<void> {
    const historical = await this.pool.query(
      `SELECT 1 FROM chain_deposit_observations AS observations
       JOIN deposit_receipts AS receipts ON receipts.network = observations.network
         AND receipts.transaction_hash = observations.transaction_hash
         AND receipts.output_index = observations.event_index
       WHERE observations.network = $1 AND observations.status = 'orphaned'
       LIMIT 1`,
      [network],
    );
    if (historical.rowCount) throw new Error('orphaned_credited_deposit_detected');
  }

  public async upsertObservation(observation: DepositObservation): Promise<'creditable' | 'already_credited'> {
    await this.assertNoOrphanedCreditObservation(observation);
    const result = await this.pool.query(
      `INSERT INTO chain_deposit_observations
       (id, network, transaction_hash, event_index, block_height, block_hash, contract_identifier, destination_address, account_id, asset_code, amount_atoms, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::DECIMAL, $12)
       ON CONFLICT (network, transaction_hash, event_index) DO UPDATE
       SET status = 'finalized_candidate', updated_at = now()
       WHERE chain_deposit_observations.status = 'orphaned'
         AND NOT EXISTS (
           SELECT 1 FROM deposit_receipts
           WHERE network = excluded.network
             AND transaction_hash = excluded.transaction_hash
             AND output_index = excluded.event_index
         )
       RETURNING status`,
      [randomUUID(), observation.network, observation.transactionHash, observation.eventIndex, observation.blockHeight, observation.blockHash, observation.contractIdentifier, observation.destinationAddress, observation.accountId, observation.assetCode, observation.amountAtoms, observation.status],
    );
    if (result.rowCount) return 'creditable';

    const existing = await this.pool.query<{ status: string }>(
      `SELECT status FROM chain_deposit_observations
       WHERE network = $1 AND transaction_hash = $2 AND event_index = $3`,
      [observation.network, observation.transactionHash, observation.eventIndex],
    );
    const status = existing.rows[0]?.status;
    if (status === 'credited') return 'already_credited';
    if (status === 'finalized_candidate') return 'creditable';
    if (status === 'orphaned') throw new Error('orphaned_credited_deposit_detected');
    throw new Error('deposit observation is not creditable');
  }

  public async markCredited(observation: DepositObservation): Promise<void> {
    const result = await this.pool.query(
      `UPDATE chain_deposit_observations SET status = 'credited', updated_at = now()
       WHERE network = $1 AND transaction_hash = $2 AND event_index = $3 AND status IN ('finalized_candidate', 'credited')`,
      [observation.network, observation.transactionHash, observation.eventIndex],
    );
    if (result.rowCount !== 1) throw new Error('deposit observation is not creditable');
  }

  private async assertNoOrphanedCreditObservation(observation: Pick<DepositObservation, 'eventIndex' | 'network' | 'transactionHash'>): Promise<void> {
    const historical = await this.pool.query(
      `SELECT 1 FROM chain_deposit_observations AS observations
       JOIN deposit_receipts AS receipts ON receipts.network = observations.network
         AND receipts.transaction_hash = observations.transaction_hash
         AND receipts.output_index = observations.event_index
       WHERE observations.network = $1
         AND observations.transaction_hash = $2
         AND observations.event_index = $3
         AND observations.status = 'orphaned'
       LIMIT 1`,
      [observation.network, observation.transactionHash, observation.eventIndex],
    );
    if (historical.rowCount) throw new Error('orphaned_credited_deposit_detected');
  }
}
