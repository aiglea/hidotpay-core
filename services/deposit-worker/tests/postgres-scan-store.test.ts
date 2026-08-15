import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { Pool } from 'pg';

import { applyMigrations } from '../../ledger-api/src/migrations.js';
import { PostgresDepositScanStore } from '../src/postgres-scan-store.js';

const databaseUrl = process.env.HIDOTPAY_TEST_DATABASE_URL;

test('Postgres scan store persists cursor and deduplicates a chain event across restart', { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const accountId = randomUUID();
  try {
    await applyMigrations(pool);
    await pool.query(`INSERT INTO assets (code, display_name, decimals) VALUES ('TSCAN', 'TSCAN', 6) ON CONFLICT (code) DO NOTHING`);
    await pool.query(`INSERT INTO accounts (id, owner_id, account_kind) VALUES ($1, $2, 'user_available')`, [accountId, randomUUID()]);
    const store = new PostgresDepositScanStore(pool);
    await store.saveCursor('tron-shasta', { blockHash: 'canonical-88', height: 88 });
    const observation = {
      accountId, amountAtoms: '123456', assetCode: 'TSCAN', blockHash: 'canonical-80', blockHeight: 80, confirmationCount: 9, contractIdentifier: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj', destinationAddress: 'T111111111111111111111111111111111', eventIndex: 0, network: 'tron-shasta', status: 'finalized_candidate' as const, transactionHash: `tx-${randomUUID()}`,
    };
    assert.equal(await store.upsertObservation(observation), true);
    assert.equal(await new PostgresDepositScanStore(pool).upsertObservation(observation), false);
    await store.markCredited(observation);
    await new PostgresDepositScanStore(pool).markCredited(observation);
    assert.deepEqual(await store.cursor('tron-shasta'), { blockHash: 'canonical-88', height: 88 });
    await store.invalidateFrom('tron-shasta', 80);
    const row = await pool.query<{ status: string }>('SELECT status FROM chain_deposit_observations WHERE network = $1 AND transaction_hash = $2 AND event_index = $3', [observation.network, observation.transactionHash, observation.eventIndex]);
    assert.equal(row.rows[0]?.status, 'orphaned');
  } finally {
    await pool.end();
  }
});
