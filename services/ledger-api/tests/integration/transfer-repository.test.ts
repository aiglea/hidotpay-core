import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { Pool } from 'pg';

import { applyMigrations } from '../../src/migrations.js';
import { PostgresLedgerRepository } from '../../src/repositories/postgres-ledger-repository.js';

// Integration tests deliberately ignore DATABASE_URL: they only run against the
// separately provisioned test database so a developer cannot seed real balances by mistake.
const databaseUrl = process.env.HIDOTPAY_TEST_DATABASE_URL;

test('CockroachDB transfer is balanced and idempotent', { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const assetCode = `T${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;
  const senderId = randomUUID();
  const recipientId = randomUUID();
  const senderAccountId = randomUUID();
  const recipientAccountId = randomUUID();
  try {
    await applyMigrations(pool);
    await pool.query('INSERT INTO assets (code, display_name, decimals) VALUES ($1, $2, $3)', [assetCode, assetCode, 6]);
    await pool.query('INSERT INTO chain_assets (network, asset_code, contract_identifier, minimum_confirmations) VALUES ($1, $2, $3, $4)', ['ethereum', assetCode, 'integration-test-contract', 12]);
    await pool.query(
      `INSERT INTO accounts (id, owner_id, account_kind) VALUES
       ($1, $2, 'user_available'), ($3, $4, 'user_available')`,
      [senderAccountId, senderId, recipientAccountId, recipientId],
    );
    await pool.query(
      `INSERT INTO account_balances (account_id, asset_code, balance_atoms) VALUES
       ($1, $2, 2000000), ($3, $2, 0)`,
      [senderAccountId, assetCode, recipientAccountId],
    );

    const repository = new PostgresLedgerRepository(pool);
    const input = {
      actorId: senderId,
      amountAtoms: '1000000',
      assetCode,
      fromAccountId: senderAccountId,
      idempotencyKey: `test-${randomUUID()}`,
      requestHash: 'test-request-hash',
      toAccountId: recipientAccountId,
    };
    const first = await repository.transferInternal(input);
    const replay = await repository.transferInternal(input);

    assert.equal(first.created, true);
    assert.equal(replay.created, false);
    assert.equal(replay.transferId, first.transferId);
    assert.deepEqual(await repository.getBalances(senderAccountId), [{ assetCode, balanceAtoms: '1000000' }]);
    assert.deepEqual(await repository.getBalances(recipientAccountId), [{ assetCode, balanceAtoms: '1000000' }]);
    const postings = await pool.query<{ total: string }>(
      'SELECT COALESCE(sum(amount_atoms), 0)::STRING AS total FROM ledger_postings WHERE transaction_id = $1',
      [first.transferId],
    );
    assert.equal(postings.rows[0]?.total, '0');
  } finally {
    await pool.end();
  }
});

test('CockroachDB deposit and withdrawal lifecycle preserves a balanced ledger', { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const assetCode = `T${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;
  const userId = randomUUID();
  const availableAccountId = randomUUID();
  const frozenAccountId = randomUUID();
  const settlementAccountId = randomUUID();
  const treasuryAccountId = randomUUID();
  try {
    await applyMigrations(pool);
    await pool.query('INSERT INTO assets (code, display_name, decimals) VALUES ($1, $2, $3)', [assetCode, assetCode, 6]);
    await pool.query('INSERT INTO chain_assets (network, asset_code, contract_identifier, minimum_confirmations) VALUES ($1, $2, $3, $4)', ['ethereum', assetCode, 'integration-test-contract', 12]);
    await pool.query(
      `INSERT INTO accounts (id, owner_id, account_kind) VALUES
       ($1, $2, 'user_available'), ($3, $2, 'user_frozen'),
       ($4, 'platform:settlement', 'platform_settlement'), ($5, 'platform:treasury', 'platform_treasury')`,
      [availableAccountId, userId, frozenAccountId, settlementAccountId, treasuryAccountId],
    );
    const repository = new PostgresLedgerRepository(pool);
    const deposit = await repository.confirmDeposit({
      actorId: 'chain-worker-01', amountAtoms: '2000000', assetCode, blockHash: `block-${randomUUID()}`, blockHeight: '123456', confirmationCount: 12, contractIdentifier: 'integration-test-contract',
      destinationAccountId: availableAccountId, network: 'ethereum', outputIndex: 0,
      transactionHash: `test-${randomUUID()}`,
    });
    const withdrawal = await repository.requestWithdrawal({
      actorId: userId, amountAtoms: '1000000', assetCode, destinationAddress: '0xabcdeffedcba11223344556677889900',
      feeAtoms: '10000', feeQuoteId: 'integration-test-quote', fromAccountId: availableAccountId, frozenAccountId, idempotencyKey: `test-${randomUUID()}`,
      network: 'ethereum', requestHash: randomUUID(),
    });
    await repository.approveWithdrawal(withdrawal.withdrawalId, 'reviewer-01');
    await repository.settleWithdrawal(withdrawal.withdrawalId, `test-${randomUUID()}`);

    assert.deepEqual(await repository.getBalances(availableAccountId), [{ assetCode, balanceAtoms: '990000' }]);
    assert.deepEqual(await repository.getBalances(frozenAccountId), [{ assetCode, balanceAtoms: '0' }]);
    assert.deepEqual(await repository.getBalances(treasuryAccountId), [{ assetCode, balanceAtoms: '10000' }]);
    const postingSum = await pool.query<{ total: string }>('SELECT COALESCE(sum(amount_atoms), 0)::STRING AS total FROM ledger_postings');
    assert.equal(postingSum.rows[0]?.total, '0');
    assert.equal(deposit.created, true);
  } finally {
    await pool.end();
  }
});
