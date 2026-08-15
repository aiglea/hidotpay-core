import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { Pool } from 'pg';

import { applyMigrations } from '../../ledger-api/src/migrations.js';
import { PostgresDepositScanStore } from '../src/postgres-scan-store.js';

function dedicatedTestDatabaseUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).pathname === '/hidotpay_test' ? value : undefined;
  } catch {
    return undefined;
  }
}

const databaseUrl = dedicatedTestDatabaseUrl(process.env.HIDOTPAY_TEST_DATABASE_URL);

test('Postgres scan store integration only accepts the dedicated hidotpay_test database URL', () => {
  assert.equal(dedicatedTestDatabaseUrl(undefined), undefined);
  assert.equal(dedicatedTestDatabaseUrl('not a URL'), undefined);
  assert.equal(dedicatedTestDatabaseUrl('postgresql://user:password@example.test/hidotpay'), undefined);
  assert.equal(
    dedicatedTestDatabaseUrl('postgresql://user:password@example.test/hidotpay_test?sslmode=verify-full'),
    'postgresql://user:password@example.test/hidotpay_test?sslmode=verify-full',
  );
});

async function createFixture(): Promise<{
  observation: {
    accountId: string;
    amountAtoms: string;
    assetCode: string;
    blockHash: string;
    blockHeight: number;
    confirmationCount: number;
    contractIdentifier: string;
    destinationAddress: string;
    eventIndex: number;
    network: string;
    status: 'finalized_candidate';
    transactionHash: string;
  };
  pool: Pool;
  store: PostgresDepositScanStore;
}> {
  const pool = new Pool({ connectionString: databaseUrl });
  const accountId = randomUUID();
  const assetCode = `TS${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;
  const network = `tron-shasta-${randomUUID()}`;
  try {
    await applyMigrations(pool);
    await pool.query('INSERT INTO assets (code, display_name, decimals) VALUES ($1, $2, 6)', [assetCode, assetCode]);
    await pool.query(`INSERT INTO accounts (id, owner_id, account_kind) VALUES ($1, $2, 'user_available')`, [accountId, randomUUID()]);
    return {
      observation: {
        accountId,
        amountAtoms: '123456',
        assetCode,
        blockHash: 'canonical-80',
        blockHeight: 80,
        confirmationCount: 9,
        contractIdentifier: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj',
        destinationAddress: 'T111111111111111111111111111111111',
        eventIndex: 0,
        network,
        status: 'finalized_candidate',
        transactionHash: `tx-${randomUUID()}`,
      },
      pool,
      store: new PostgresDepositScanStore(pool),
    };
  } catch (error) {
    await pool.end();
    throw error;
  }
}

test('Postgres scan store persists cursor and leaves a current finalized observation creditable across restart', { skip: !databaseUrl }, async () => {
  const { observation, pool, store } = await createFixture();
  try {
    await store.saveCursor(observation.network, { blockHash: 'canonical-88', height: 88 });
    assert.equal(await store.upsertObservation(observation), 'creditable');
    assert.equal(await new PostgresDepositScanStore(pool).upsertObservation(observation), 'creditable');
    assert.deepEqual(await store.cursor(observation.network), { blockHash: 'canonical-88', height: 88 });
  } finally {
    await pool.end();
  }
});

test('Postgres scan store rejects an orphaned receipt and refuses direct replay', { skip: !databaseUrl }, async () => {
  const { observation, pool, store } = await createFixture();
  try {
    assert.equal(await store.upsertObservation(observation), 'creditable');
    const row = await pool.query<{ id: string }>(
      `UPDATE chain_deposit_observations SET status = 'orphaned' WHERE network = $1 AND transaction_hash = $2 AND event_index = $3 RETURNING id`,
      [observation.network, observation.transactionHash, observation.eventIndex],
    );
    assert.ok(row.rows[0]);
    await pool.query(
      `INSERT INTO deposit_receipts
       (id, network, transaction_hash, output_index, asset_code, destination_account_id, amount_atoms, confirmation_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7::DECIMAL, $8)`,
      [randomUUID(), observation.network, observation.transactionHash, observation.eventIndex, observation.assetCode, observation.accountId, observation.amountAtoms, observation.confirmationCount],
    );
    await assert.rejects(() => store.assertNoOrphanedCredits(observation.network), /orphaned_credited_deposit_detected/);
    await assert.rejects(() => store.upsertObservation(observation), /orphaned_credited_deposit_detected/);
  } finally {
    await pool.end();
  }
});

test('Postgres scan store revives an orphaned observation without a receipt as creditable', { skip: !databaseUrl }, async () => {
  const { observation, pool, store } = await createFixture();
  try {
    assert.equal(await store.upsertObservation(observation), 'creditable');
    await pool.query(
      `UPDATE chain_deposit_observations SET status = 'orphaned' WHERE network = $1 AND transaction_hash = $2 AND event_index = $3`,
      [observation.network, observation.transactionHash, observation.eventIndex],
    );
    assert.equal(await store.upsertObservation(observation), 'creditable');
    const row = await pool.query<{ status: string }>(
      'SELECT status FROM chain_deposit_observations WHERE network = $1 AND transaction_hash = $2 AND event_index = $3',
      [observation.network, observation.transactionHash, observation.eventIndex],
    );
    assert.equal(row.rows[0]?.status, 'finalized_candidate');
  } finally {
    await pool.end();
  }
});

test('Postgres scan store returns already_credited only for a current credited observation', { skip: !databaseUrl }, async () => {
  const { observation, pool, store } = await createFixture();
  try {
    assert.equal(await store.upsertObservation(observation), 'creditable');
    await store.markCredited(observation);
    assert.equal(await store.upsertObservation(observation), 'already_credited');
  } finally {
    await pool.end();
  }
});

test('Postgres scan store binds network input instead of executing caller-controlled SQL', { skip: !databaseUrl }, async () => {
  const { observation, pool, store } = await createFixture();
  try {
    assert.equal(await store.upsertObservation(observation), 'creditable');
    await pool.query(
      `UPDATE chain_deposit_observations SET status = 'orphaned' WHERE network = $1 AND transaction_hash = $2 AND event_index = $3`,
      [observation.network, observation.transactionHash, observation.eventIndex],
    );
    await pool.query(
      `INSERT INTO deposit_receipts
       (id, network, transaction_hash, output_index, asset_code, destination_account_id, amount_atoms, confirmation_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7::DECIMAL, $8)`,
      [randomUUID(), observation.network, observation.transactionHash, observation.eventIndex, observation.assetCode, observation.accountId, observation.amountAtoms, observation.confirmationCount],
    );
    await assert.doesNotReject(() => store.assertNoOrphanedCredits(`${observation.network}' OR '1' = '1`));
    await assert.rejects(() => store.assertNoOrphanedCredits(observation.network), /orphaned_credited_deposit_detected/);
  } finally {
    await pool.end();
  }
});
