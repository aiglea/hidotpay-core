import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { Pool } from 'pg';

import { applyMigrations } from '../../src/migrations.js';
import { PostgresLedgerRepository } from '../../src/repositories/postgres-ledger-repository.js';

const configuredDatabaseUrl = process.env.HIDOTPAY_TEST_DATABASE_URL;
const databaseUrl = (() => {
  if (!configuredDatabaseUrl) return undefined;
  try {
    return new URL(configuredDatabaseUrl).pathname === '/hidotpay_test' ? configuredDatabaseUrl : undefined;
  } catch {
    return undefined;
  }
})();

test('CockroachDB wallet transaction history is account-isolated and keyset-paginated', { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const assetCode = `T${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;
  const ownerAccountId = randomUUID();
  const recipientAccountId = randomUUID();
  const unrelatedAccountId = randomUUID();
  const firstTransactionId = randomUUID();
  const secondTransactionId = randomUUID();
  try {
    await applyMigrations(pool);
    await pool.query('INSERT INTO assets (code, display_name, decimals) VALUES ($1, $2, 6)', [assetCode, assetCode]);
    await pool.query(
      `INSERT INTO accounts (id, owner_id, account_kind) VALUES
       ($1, $2, 'user_available'), ($3, $4, 'user_available'), ($5, $6, 'user_available')`,
      [ownerAccountId, randomUUID(), recipientAccountId, randomUUID(), unrelatedAccountId, randomUUID()],
    );
    await pool.query(
      `INSERT INTO ledger_transactions (id, transaction_type, idempotency_scope, idempotency_key, request_hash, actor_id, created_at)
       VALUES
       ($1, 'internal_transfer', $2, $3, $4, $5, '2026-08-15T10:00:00.000Z'),
       ($6, 'internal_transfer', $7, $8, $9, $10, '2026-08-15T10:01:00.000Z')`,
      [firstTransactionId, randomUUID(), randomUUID(), randomUUID(), randomUUID(), secondTransactionId, randomUUID(), randomUUID(), randomUUID(), randomUUID()],
    );
    await pool.query(
      `INSERT INTO ledger_postings (id, transaction_id, account_id, asset_code, amount_atoms) VALUES
       ($1, $2, $3, $4, -1000000), ($5, $2, $6, $4, 1000000),
       ($7, $8, $3, $4, -500000), ($9, $8, $6, $4, 500000)`,
      [randomUUID(), firstTransactionId, ownerAccountId, assetCode, randomUUID(), recipientAccountId, randomUUID(), secondTransactionId, randomUUID()],
    );
    const repository = new PostgresLedgerRepository(pool);

    const firstPage = await repository.listWalletTransactions(ownerAccountId, { limit: 1 });
    assert.deepEqual(firstPage.transactions, [{
      amountAtoms: '500000', assetCode, createdAt: '2026-08-15T10:01:00.000Z', direction: 'outgoing', id: secondTransactionId, type: 'internal_transfer',
    }]);
    assert.ok(firstPage.nextCursor);
    assert.deepEqual(await repository.listWalletTransactions(ownerAccountId, { cursor: firstPage.nextCursor, limit: 1 }), {
      transactions: [{
        amountAtoms: '1000000', assetCode, createdAt: '2026-08-15T10:00:00.000Z', direction: 'outgoing', id: firstTransactionId, type: 'internal_transfer',
      }],
    });
    assert.equal((await repository.listWalletTransactions(recipientAccountId, { limit: 1 })).transactions[0]?.direction, 'incoming');
    assert.deepEqual(await repository.listWalletTransactions(unrelatedAccountId, { limit: 1 }), { transactions: [] });
  } finally {
    await pool.end();
  }
});
