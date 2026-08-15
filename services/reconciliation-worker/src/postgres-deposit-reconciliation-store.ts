import type { Pool, PoolClient } from 'pg';

import type { DepositReconciliationStore, PendingDeposit } from './deposit-reconciliation.js';

type PendingDepositRow = {
  amount_atoms: string;
  asset_code: string;
  blnk_reference: string | null;
  decimals: string;
  destination_account_id: string;
  id: string;
  ledger_transaction_id: string;
};

export class PostgresDepositReconciliationStore implements DepositReconciliationStore {
  public constructor(
    private readonly pool: Pool,
    private readonly owner: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (!/^[A-Za-z0-9._:-]{3,128}$/.test(owner)) throw new Error('invalid reconciliation worker owner');
  }

  public async claimPending(limit: number): Promise<PendingDeposit[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error('invalid reconciliation claim limit');
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
        const rows = await client.query<PendingDepositRow>(
          `SELECT receipts.id, receipts.amount_atoms::STRING, receipts.asset_code, receipts.destination_account_id,
                  receipts.credited_transaction_id AS ledger_transaction_id, receipts.blnk_reference, assets.decimals::STRING
           FROM deposit_receipts AS receipts
           JOIN assets ON assets.code = receipts.asset_code
           WHERE receipts.credited_transaction_id IS NOT NULL
             AND receipts.blnk_reconciled_at IS NULL
             AND (receipts.blnk_lease_until IS NULL OR receipts.blnk_lease_until < $1)
           ORDER BY receipts.created_at ASC
           LIMIT $2 FOR UPDATE`,
          [this.now(), limit],
        );
        const leaseUntil = new Date(this.now().valueOf() + 60_000);
        for (const row of rows.rows) {
          await client.query(
            `UPDATE deposit_receipts SET blnk_lease_owner = $2, blnk_lease_until = $3
             WHERE id = $1`,
            [row.id, this.owner, leaseUntil],
          );
        }
        await client.query('COMMIT');
        return rows.rows.map(mapPendingDeposit);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        if (attempt < 3 && (error as { code?: string }).code === '40001') continue;
        throw error;
      } finally {
        client.release();
      }
    }
    throw new Error('reconciliation claim retry limit exhausted');
  }

  public async claimPendingByLedgerTransactionId(ledgerTransactionId: string): Promise<PendingDeposit | undefined> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
        const rows = await client.query<PendingDepositRow>(
          `SELECT receipts.id, receipts.amount_atoms::STRING, receipts.asset_code, receipts.destination_account_id,
                  receipts.credited_transaction_id AS ledger_transaction_id, receipts.blnk_reference, assets.decimals::STRING
           FROM deposit_receipts AS receipts
           JOIN assets ON assets.code = receipts.asset_code
           WHERE receipts.credited_transaction_id = $1
             AND receipts.blnk_reconciled_at IS NULL
             AND (receipts.blnk_lease_until IS NULL OR receipts.blnk_lease_until < $2)
           LIMIT 1 FOR UPDATE`,
          [ledgerTransactionId, this.now()],
        );
        const row = rows.rows[0];
        if (row) {
          const leaseUntil = new Date(this.now().valueOf() + 60_000);
          await client.query(
            `UPDATE deposit_receipts SET blnk_lease_owner = $2, blnk_lease_until = $3 WHERE id = $1`,
            [row.id, this.owner, leaseUntil],
          );
        }
        await client.query('COMMIT');
        return row ? mapPendingDeposit(row) : undefined;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        if (attempt < 3 && (error as { code?: string }).code === '40001') continue;
        throw error;
      } finally {
        client.release();
      }
    }
    throw new Error('reconciliation claim retry limit exhausted');
  }

  public async recordFailure(id: string, error: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE deposit_receipts
       SET blnk_attempts = blnk_attempts + 1, blnk_last_error = $3, blnk_lease_owner = NULL, blnk_lease_until = NULL
       WHERE id = $1 AND blnk_lease_owner = $2 AND blnk_reconciled_at IS NULL`,
      [id, this.owner, boundedError(error)],
    );
    if (result.rowCount !== 1) throw new Error('reconciliation deposit lease no longer belongs to worker');
  }

  public async recordResult(input: { blnkReference: string; blnkTransactionId: string; id: string; reconciled: boolean; status: string }): Promise<void> {
    const result = await this.pool.query(
      `UPDATE deposit_receipts
       SET blnk_reference = $3, blnk_transaction_id = $4, blnk_status = $5,
           blnk_reconciled_at = CASE WHEN $6 THEN now() ELSE NULL END,
           blnk_last_error = NULL, blnk_lease_owner = NULL, blnk_lease_until = NULL
       WHERE id = $1 AND blnk_lease_owner = $2 AND blnk_reconciled_at IS NULL`,
      [input.id, this.owner, input.blnkReference, input.blnkTransactionId, input.status, input.reconciled],
    );
    if (result.rowCount !== 1) throw new Error('reconciliation deposit lease no longer belongs to worker');
  }
}

function mapPendingDeposit(row: PendingDepositRow): PendingDeposit {
  const decimals = Number(row.decimals);
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 30) throw new Error('asset decimals are invalid for Blnk reconciliation');
  return {
    amountAtoms: row.amount_atoms,
    assetCode: row.asset_code,
    ...(row.blnk_reference ? { blnkReference: row.blnk_reference } : {}),
    destinationAccountId: row.destination_account_id,
    id: row.id,
    ledgerTransactionId: row.ledger_transaction_id,
    precision: `1${'0'.repeat(decimals)}`,
  };
}

function boundedError(error: string): string {
  return error.replace(/[\r\n]/g, ' ').slice(0, 512);
}
