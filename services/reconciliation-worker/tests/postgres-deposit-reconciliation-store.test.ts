import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { Pool } from 'pg';

import { applyMigrations } from '../../ledger-api/src/migrations.js';
import { PostgresDepositReconciliationStore } from '../src/postgres-deposit-reconciliation-store.js';

const databaseUrl = process.env.HIDOTPAY_TEST_DATABASE_URL;

test('Cockroach reconciliation state keeps the Blnk reference and does not claim an applied deposit again', { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const assetCode = `US${randomUUID().replaceAll('-', '').slice(0, 10)}`;
  const accountId = randomUUID();
  const depositId = randomUUID();
  const transactionId = randomUUID();
  try {
    await applyMigrations(pool);
    await pool.query('INSERT INTO assets (code, display_name, decimals) VALUES ($1, $2, 6)', [assetCode, assetCode]);
    await pool.query('INSERT INTO accounts (id, owner_id, account_kind) VALUES ($1, $2, $3)', [accountId, `user:${accountId}`, 'user_available']);
    await pool.query(
      `INSERT INTO ledger_transactions (id, transaction_type, idempotency_scope, idempotency_key, request_hash, actor_id)
       VALUES ($1, 'deposit_credit', $2, $3, $4, 'chain_worker')`,
      [transactionId, `test:${transactionId}`, transactionId, transactionId],
    );
    await pool.query(
      `INSERT INTO deposit_receipts
       (id, network, transaction_hash, output_index, asset_code, destination_account_id, amount_atoms, confirmation_count, credited_transaction_id)
       VALUES ($1, 'tron-shasta', $2, 0, $3, $4, 1000001, 20, $5)`,
      [depositId, `test-${depositId}`, assetCode, accountId, transactionId],
    );
    const store = new PostgresDepositReconciliationStore(pool, 'reconciler-a');

    const pending = await store.claimPending(500);
    assert.deepEqual(pending.find((item) => item.id === depositId), {
      amountAtoms: '1000001', assetCode, destinationAccountId: accountId, id: depositId, ledgerTransactionId: transactionId, precision: '1000000',
    });
    await store.recordResult({
      blnkReference: `hidotpay:ledger:${transactionId}`,
      blnkTransactionId: 'txn_blnk_123',
      id: depositId,
      reconciled: true,
      status: 'APPLIED',
    });
    assert.equal((await store.claimPending(500)).some((item) => item.id === depositId), false);
    const saved = await pool.query<{ blnk_reference: string; blnk_status: string; blnk_transaction_id: string }>(
      'SELECT blnk_reference, blnk_transaction_id, blnk_status FROM deposit_receipts WHERE id = $1', [depositId],
    );
    assert.deepEqual(saved.rows[0], {
      blnk_reference: `hidotpay:ledger:${transactionId}`,
      blnk_status: 'APPLIED',
      blnk_transaction_id: 'txn_blnk_123',
    });
  } finally {
    await pool.end();
  }
});
