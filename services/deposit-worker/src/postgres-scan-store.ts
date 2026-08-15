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

  public async invalidateFrom(network: string, blockHeight: number): Promise<void> {
    await this.pool.query(
      `UPDATE chain_deposit_observations SET status = 'orphaned', updated_at = now()
       WHERE network = $1 AND block_height >= $2 AND status IN ('observed', 'finalized_candidate', 'credited')`,
      [network, blockHeight],
    );
  }

  public async saveCursor(network: string, cursor: ScanCursor): Promise<void> {
    await this.pool.query(
      `INSERT INTO chain_scan_cursors (network, block_height, block_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (network) DO UPDATE SET block_height = excluded.block_height, block_hash = excluded.block_hash, updated_at = now()`,
      [network, cursor.height, cursor.blockHash],
    );
  }

  public async upsertObservation(observation: DepositObservation): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO chain_deposit_observations
       (id, network, transaction_hash, event_index, block_height, block_hash, contract_identifier, destination_address, account_id, asset_code, amount_atoms, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::DECIMAL, $12)
       ON CONFLICT (network, transaction_hash, event_index) DO NOTHING`,
      [randomUUID(), observation.network, observation.transactionHash, observation.eventIndex, observation.blockHeight, observation.blockHash, observation.contractIdentifier, observation.destinationAddress, observation.accountId, observation.assetCode, observation.amountAtoms, observation.status],
    );
    return result.rowCount === 1;
  }

  public async markCredited(observation: DepositObservation): Promise<void> {
    const result = await this.pool.query(
      `UPDATE chain_deposit_observations SET status = 'credited', updated_at = now()
       WHERE network = $1 AND transaction_hash = $2 AND event_index = $3 AND status IN ('finalized_candidate', 'credited')`,
      [observation.network, observation.transactionHash, observation.eventIndex],
    );
    if (result.rowCount !== 1) throw new Error('deposit observation is not creditable');
  }
}
