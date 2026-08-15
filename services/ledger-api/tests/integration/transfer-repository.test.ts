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
  let settlementAccountId = '';
  let treasuryAccountId = '';
  try {
    await applyMigrations(pool);
    await pool.query('INSERT INTO assets (code, display_name, decimals) VALUES ($1, $2, $3)', [assetCode, assetCode, 6]);
    await pool.query('INSERT INTO chain_assets (network, asset_code, contract_identifier, minimum_confirmations) VALUES ($1, $2, $3, $4)', ['ethereum', assetCode, 'integration-test-contract', 12]);
    await pool.query(
      `INSERT INTO accounts (id, owner_id, account_kind) VALUES
       ($1, $2, 'user_available'), ($3, $2, 'user_frozen')`,
      [availableAccountId, userId, frozenAccountId],
    );
    await pool.query(
      `INSERT INTO accounts (id, owner_id, account_kind) VALUES
       ($1, 'platform:settlement', 'platform_settlement'), ($2, 'platform:treasury', 'platform_treasury')
       ON CONFLICT (owner_id, account_kind) DO NOTHING`,
      [randomUUID(), randomUUID()],
    );
    const platformAccounts = await pool.query<{ account_kind: string; id: string }>(
      `SELECT id, account_kind FROM accounts
       WHERE (owner_id = 'platform:settlement' AND account_kind = 'platform_settlement')
          OR (owner_id = 'platform:treasury' AND account_kind = 'platform_treasury')`,
    );
    settlementAccountId = platformAccounts.rows.find((account) => account.account_kind === 'platform_settlement')?.id ?? '';
    treasuryAccountId = platformAccounts.rows.find((account) => account.account_kind === 'platform_treasury')?.id ?? '';
    assert.ok(settlementAccountId);
    assert.ok(treasuryAccountId);
    const repository = new PostgresLedgerRepository(pool);
    const deposit = await repository.confirmDeposit({
      actorId: 'chain-worker-01', amountAtoms: '2000000', assetCode, blockHash: `block-${randomUUID()}`, blockHeight: '123456', confirmationCount: 12, contractIdentifier: 'integration-test-contract',
      destinationAccountId: availableAccountId, network: 'ethereum', outputIndex: 0,
      transactionHash: `test-${randomUUID()}`,
    });
    const feeQuote = await repository.createWithdrawalFeeQuote({
      amountAtoms: '1000000', assetCode, expiresAt: new Date(Date.now() + 60_000).toISOString(), feeAtoms: '10000', network: 'ethereum', userId,
    });
    await pool.query(
      `INSERT INTO withdrawal_address_whitelist (id, user_id, network, address, added_at, status)
       VALUES ($1, $2, 'ethereum', '0xabcdeffedcba11223344556677889900', now() - INTERVAL '2 days', 'active')`,
      [randomUUID(), userId],
    );
    const withdrawal = await repository.requestWithdrawal({
      actorId: userId, amountAtoms: '1000000', assetCode, destinationAddress: '0xabcdeffedcba11223344556677889900',
      feeQuoteId: feeQuote.id, fromAccountId: availableAccountId, frozenAccountId, idempotencyKey: `test-${randomUUID()}`,
      network: 'ethereum', requestHash: randomUUID(),
      riskControls: { dailyLimitAtoms: '5000000', maxPerWithdrawalAtoms: '2000000', whitelistCooldownMs: 24 * 60 * 60 * 1000 },
    });
    await repository.approveWithdrawal(withdrawal.withdrawalId, 'reviewer-01');
    const chainTransactionHash = `test-${randomUUID()}`;
    assert.equal((await repository.markWithdrawalBroadcast(withdrawal.withdrawalId, chainTransactionHash)).status, 'broadcast');
    assert.equal((await repository.settleWithdrawal(withdrawal.withdrawalId, chainTransactionHash)).status, 'confirmed');

    assert.deepEqual(await repository.getBalances(availableAccountId), [{ assetCode, balanceAtoms: '990000' }]);
    assert.deepEqual(await repository.getBalances(frozenAccountId), [{ assetCode, balanceAtoms: '0' }]);
    assert.deepEqual(
      (await repository.getBalances(treasuryAccountId)).filter((balance) => balance.assetCode === assetCode),
      [{ assetCode, balanceAtoms: '10000' }],
    );
    const postingSum = await pool.query<{ total: string }>('SELECT COALESCE(sum(amount_atoms), 0)::STRING AS total FROM ledger_postings');
    assert.equal(postingSum.rows[0]?.total, '0');
    assert.equal(deposit.created, true);
  } finally {
    await pool.end();
  }
});

test('CockroachDB serializes competing withdrawals so a user balance never becomes negative', { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const assetCode = `T${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;
  const senderId = randomUUID();
  const senderAccountId = randomUUID();
  const recipientOneAccountId = randomUUID();
  const recipientTwoAccountId = randomUUID();
  try {
    await applyMigrations(pool);
    await pool.query('INSERT INTO assets (code, display_name, decimals) VALUES ($1, $2, $3)', [assetCode, assetCode, 6]);
    await pool.query(
      `INSERT INTO accounts (id, owner_id, account_kind) VALUES
       ($1, $2, 'user_available'), ($3, $4, 'user_available'), ($5, $6, 'user_available')`,
      [senderAccountId, senderId, recipientOneAccountId, randomUUID(), recipientTwoAccountId, randomUUID()],
    );
    await pool.query(
      `INSERT INTO account_balances (account_id, asset_code, balance_atoms) VALUES
       ($1, $2, 1000000), ($3, $2, 0), ($4, $2, 0)`,
      [senderAccountId, assetCode, recipientOneAccountId, recipientTwoAccountId],
    );
    const repository = new PostgresLedgerRepository(pool);
    const outcomes = await Promise.allSettled([
      repository.transferInternal({ actorId: senderId, amountAtoms: '750000', assetCode, fromAccountId: senderAccountId, idempotencyKey: `compete-${randomUUID()}`, requestHash: randomUUID(), toAccountId: recipientOneAccountId }),
      repository.transferInternal({ actorId: senderId, amountAtoms: '750000', assetCode, fromAccountId: senderAccountId, idempotencyKey: `compete-${randomUUID()}`, requestHash: randomUUID(), toAccountId: recipientTwoAccountId }),
    ]);

    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter((outcome) => outcome.status === 'rejected').length, 1);
    const balances = await pool.query<{ balance_atoms: string }>(
      'SELECT balance_atoms::STRING FROM account_balances WHERE account_id = $1 AND asset_code = $2',
      [senderAccountId, assetCode],
    );
    assert.equal(balances.rows[0]?.balance_atoms, '250000');
    const minimum = await pool.query<{ minimum: string }>(
      'SELECT min(balance_atoms)::STRING AS minimum FROM account_balances WHERE asset_code = $1',
      [assetCode],
    );
    assert.equal(minimum.rows[0]?.minimum, '0');
  } finally {
    await pool.end();
  }
});
