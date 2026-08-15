import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { Pool } from 'pg';

import { applyMigrations } from '../../src/migrations.js';
import { PostgresWalletAddressRepository } from '../../src/repositories/postgres-wallet-address-repository.js';

const databaseUrl = process.env.HIDOTPAY_TEST_DATABASE_URL;

const testAddressSeed = randomUUID().replaceAll('-', '');

function testAddress(index: number): string {
  return `T${testAddressSeed}${String(index + 1)}`;
}

test('a user receives one persistent independent address per network, even under concurrent allocation', { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const firstUserId = randomUUID();
  const secondUserId = randomUUID();
  const firstAccountId = randomUUID();
  const secondAccountId = randomUUID();
  try {
    await applyMigrations(pool);
    await pool.query(
      `INSERT INTO accounts (id, owner_id, account_kind) VALUES
       ($1, $2, 'user_available'), ($3, $4, 'user_available')`,
      [firstAccountId, firstUserId, secondAccountId, secondUserId],
    );
    await pool.query(
      `INSERT INTO wallet_key_versions (key_version, signer_key_ref, status)
       VALUES (1, $1, 'active') ON CONFLICT (key_version) DO NOTHING`,
      ['testnet-key-v1'],
    );
    const repository = new PostgresWalletAddressRepository(pool, {
      deriveDepositAddress: async ({ derivationIndex }) => testAddress(derivationIndex),
    });

    const [first, repeated] = await Promise.all([
      repository.allocate({ accountId: firstAccountId, network: 'tron-shasta', ownerId: firstUserId }),
      repository.allocate({ accountId: firstAccountId, network: 'tron-shasta', ownerId: firstUserId }),
    ]);
    assert.equal(first.address, repeated.address);
    assert.equal(first.derivationIndex, repeated.derivationIndex);

    const afterRestart = await new PostgresWalletAddressRepository(pool, {
      deriveDepositAddress: async () => { throw new Error('existing address must be returned without deriving another key'); },
    }).allocate({ accountId: firstAccountId, network: 'tron-shasta', ownerId: firstUserId });
    assert.deepEqual(afterRestart, first);

    const otherUser = await repository.allocate({ accountId: secondAccountId, network: 'tron-shasta', ownerId: secondUserId });
    assert.notEqual(otherUser.address, first.address);
    const rows = await pool.query<{ count: string }>(
      'SELECT count(*)::STRING AS count FROM wallet_addresses WHERE network = $1 AND owner_id = $2',
      ['tron-shasta', firstUserId],
    );
    assert.equal(rows.rows[0]?.count, '1');
  } finally {
    await pool.end();
  }
});
