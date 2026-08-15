import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../../src/http/app.js';
import { InMemoryLedgerRepository } from '../../src/repositories/in-memory-ledger-repository.js';
import { fixedWithdrawalFeePolicy } from '../../src/services/funding-service.js';

const senderId = '8bb8cf65-f38e-4d82-a0f3-6c1df4fcf51c';
const recipientId = '4109b403-5f29-48c9-9ff3-4ad51d6742d8';
const senderAccountId = '0b6f6cdc-2974-45a0-a2d0-c1282e382771';
const recipientAccountId = 'a1adc47c-46c4-4482-af47-4f4d608e15c5';
const senderFrozenAccountId = '5e7f2b5f-b30f-4c87-a01d-a4df3e46ff6f';
const settlementAccountId = 'd7a38d7a-7b71-4d5d-86b4-4fae3c998233';
const treasuryAccountId = 'd52a5b67-65c8-448f-ae6e-fbe4df93c916';

async function createFixture(options: { withdrawalRiskControls?: { dailyLimitAtoms: string; maxPerWithdrawalAtoms: string; whitelistCooldownMs: number } } = {}) {
  const repository = new InMemoryLedgerRepository();
  repository.seedAsset({ code: 'USDT', decimals: 6 });
  repository.seedChainAsset('ethereum', 'USDT', 12, '0xusdtcontract');
  repository.seedAccount({ id: senderAccountId, ownerId: senderId, accountKind: 'user_available' });
  repository.seedAccount({ id: senderFrozenAccountId, ownerId: senderId, accountKind: 'user_frozen' });
  repository.seedAccount({ id: recipientAccountId, ownerId: recipientId, accountKind: 'user_available' });
  repository.seedAccount({ id: settlementAccountId, ownerId: 'platform:settlement', accountKind: 'platform_settlement' });
  repository.seedAccount({ id: treasuryAccountId, ownerId: 'platform:treasury', accountKind: 'platform_treasury' });
  repository.seedBalance(senderAccountId, 'USDT', '2000000');
  repository.seedWithdrawalWhitelist({
    addedAt: '2026-08-12T00:00:00.000Z',
    address: '0xabcdeffedcba11223344556677889900',
    network: 'ethereum',
    status: 'active',
    userId: senderId,
  });
  const app = buildApp({
    environment: 'test',
    repository,
    withdrawalFeePolicy: fixedWithdrawalFeePolicy({ 'ethereum:USDT': '10000' }),
    withdrawalRiskControls: options.withdrawalRiskControls,
  });
  await app.ready();
  return { app, repository };
}

const headers = {
  'content-type': 'application/json',
  'idempotency-key': 'transfer-20260813-001',
  'x-actor-id': senderId,
};

const payload = {
  asset_code: 'USDT',
  amount_atoms: '1000000',
  from_account_id: senderAccountId,
  to_account_id: recipientAccountId,
};

async function createWithdrawalFeeQuote(app: Awaited<ReturnType<typeof buildApp>>, amountAtoms = '1000000'): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/withdrawal-fee-quotes',
    headers: { 'content-type': 'application/json', 'x-actor-id': senderId },
    payload: { amount_atoms: amountAtoms, asset_code: 'USDT', network: 'ethereum' },
  });
  assert.equal(response.statusCode, 201);
  return response.json().fee_quote_id;
}

test('same idempotency key returns the original transfer without a second debit', async (t) => {
  const { app, repository } = await createFixture();
  t.after(() => app.close());

  const first = await app.inject({ method: 'POST', url: '/v1/internal-transfers', headers, payload });
  const replay = await app.inject({ method: 'POST', url: '/v1/internal-transfers', headers, payload });

  assert.equal(first.statusCode, 201);
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.json().transfer_id, first.json().transfer_id);
  assert.equal(repository.balanceOf(senderAccountId, 'USDT'), '1000000');
  assert.equal(repository.balanceOf(recipientAccountId, 'USDT'), '1000000');
});

test('my internal transfer route derives the sender account from the authenticated identity', async (t) => {
  const { app, repository } = await createFixture();
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/v1/me/internal-transfers',
    headers: { ...headers, 'idempotency-key': 'transfer-20260815-me-001' },
    payload: { asset_code: 'USDT', amount_atoms: '1000000', recipient_wallet_id: recipientAccountId },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(repository.balanceOf(senderAccountId, 'USDT'), '1000000');
  assert.equal(repository.balanceOf(recipientAccountId, 'USDT'), '1000000');
});

test('reusing an idempotency key for a different request is rejected', async (t) => {
  const { app } = await createFixture();
  t.after(() => app.close());

  await app.inject({ method: 'POST', url: '/v1/internal-transfers', headers, payload });
  const conflict = await app.inject({
    method: 'POST',
    url: '/v1/internal-transfers',
    headers,
    payload: { ...payload, amount_atoms: '2' },
  });

  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.json().code, 'idempotency_conflict');
});

test('transfer rejects an amount above available balance', async (t) => {
  const { app } = await createFixture();
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/v1/internal-transfers',
    headers: { ...headers, 'idempotency-key': 'transfer-20260813-002' },
    payload: { ...payload, amount_atoms: '2000001' },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().code, 'insufficient_funds');
});

test('transfer rejects a source account not owned by the actor', async (t) => {
  const { app } = await createFixture();
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/v1/internal-transfers',
    headers: { ...headers, 'x-actor-id': recipientId, 'idempotency-key': 'transfer-20260813-003' },
    payload,
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().code, 'account_not_owned');
});

test('transfer only permits a user available account as the destination', async (t) => {
  const { app } = await createFixture();
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST', url: '/v1/internal-transfers',
    headers: { ...headers, 'idempotency-key': 'transfer-20260813-004' },
    payload: { ...payload, to_account_id: senderFrozenAccountId },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().code, 'account_unavailable');
});

test('balance endpoint rejects an account owned by another user', async (t) => {
  const { app } = await createFixture();
  t.after(() => app.close());

  const response = await app.inject({
    method: 'GET',
    url: `/v1/accounts/${senderAccountId}/balances`,
    headers: { 'x-actor-id': recipientId },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().code, 'account_not_owned');
});

test('development deployment rejects forged test identity headers', async (t) => {
  const repository = new InMemoryLedgerRepository();
  repository.seedAsset({ code: 'USDT', decimals: 6 });
  repository.seedAccount({ id: senderAccountId, ownerId: senderId, accountKind: 'user_available' });
  const app = buildApp({
    environment: 'development',
    logtoAudience: 'https://api-dev.hidotpay.com',
    logtoIssuer: 'https://ngu7sy.logto.app/oidc',
    repository,
    withdrawalFeePolicy: fixedWithdrawalFeePolicy({ 'ethereum:USDT': '10000' }),
  });
  await app.ready();
  t.after(() => app.close());

  const denied = await app.inject({
    method: 'GET', url: `/v1/accounts/${senderAccountId}/balances`, headers: { 'x-actor-id': senderId },
  });
  assert.equal(denied.statusCode, 401);
});

test('confirmed chain deposit can only be credited by a chain worker and is deduplicated', async (t) => {
  const { app, repository } = await createFixture();
  t.after(() => app.close());
  const body = {
    amount_atoms: '500000', asset_code: 'USDT', block_hash: '0xblock11223344556677889900', block_height: '123456', confirmation_count: 12, contract_identifier: '0xusdtcontract',
    destination_account_id: recipientAccountId, network: 'ethereum', output_index: 0,
    transaction_hash: '0xabcdeffedcba11223344556677889900',
  };
  const forbidden = await app.inject({
    method: 'POST', url: '/v1/deposits/confirmed', headers: { 'content-type': 'application/json', 'x-actor-id': senderId }, payload: body,
  });
  assert.equal(forbidden.statusCode, 403);

  const headers = { 'content-type': 'application/json', 'x-actor-id': 'chain-worker-01', 'x-actor-roles': 'chain_worker' };
  const first = await app.inject({ method: 'POST', url: '/v1/deposits/confirmed', headers, payload: body });
  const replay = await app.inject({ method: 'POST', url: '/v1/deposits/confirmed', headers, payload: body });
  assert.equal(first.statusCode, 201);
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.json().deposit_id, first.json().deposit_id);
  assert.equal(repository.balanceOf(recipientAccountId, 'USDT'), '500000');
  assert.equal(repository.balanceOf(settlementAccountId, 'USDT'), '-500000');
});

test('deposit cannot credit before the configured confirmation threshold', async (t) => {
  const { app } = await createFixture();
  t.after(() => app.close());
  const response = await app.inject({
    method: 'POST', url: '/v1/deposits/confirmed',
    headers: { 'content-type': 'application/json', 'x-actor-id': 'chain-worker-01', 'x-actor-roles': 'chain_worker' },
    payload: {
      amount_atoms: '500000', asset_code: 'USDT', block_hash: '0xblock11223344556677889900', block_height: '123456', confirmation_count: 11, contract_identifier: '0xusdtcontract',
      destination_account_id: recipientAccountId, network: 'ethereum', output_index: 0,
      transaction_hash: '0xabcdeffedcba11223344556677889900',
    },
  });
  assert.equal(response.statusCode, 409);
  assert.equal(response.json().code, 'deposit_not_final');
});

test('a user can receive a short-lived withdrawal fee quote before requesting a withdrawal', async (t) => {
  const { app } = await createFixture();
  t.after(() => app.close());

  const quote = await app.inject({
    method: 'POST',
    url: '/v1/withdrawal-fee-quotes',
    headers: { 'content-type': 'application/json', 'x-actor-id': senderId },
    payload: { amount_atoms: '1000000', asset_code: 'USDT', network: 'ethereum' },
  });

  assert.equal(quote.statusCode, 201);
  assert.match(quote.json().fee_quote_id, /^[0-9a-f-]{36}$/);
  assert.equal(quote.json().fee_atoms, '10000');
  assert.match(quote.json().expires_at, /^\d{4}-\d{2}-\d{2}T/);
});

test('a fee quote is owned by one user and can freeze funds only once', async (t) => {
  const { app, repository } = await createFixture();
  t.after(() => app.close());
  const feeQuoteId = await createWithdrawalFeeQuote(app);
  const body = {
    amount_atoms: '1000000', asset_code: 'USDT', destination_address: '0xabcdeffedcba11223344556677889900',
    fee_quote_id: feeQuoteId, from_account_id: senderAccountId, frozen_account_id: senderFrozenAccountId, network: 'ethereum',
  };
  const first = await app.inject({
    method: 'POST', url: '/v1/withdrawals',
    headers: { 'content-type': 'application/json', 'x-actor-id': senderId, 'idempotency-key': 'quote-consume-first-20260814' }, payload: body,
  });
  const replayWithNewKey = await app.inject({
    method: 'POST', url: '/v1/withdrawals',
    headers: { 'content-type': 'application/json', 'x-actor-id': senderId, 'idempotency-key': 'quote-consume-second-20260814' }, payload: body,
  });
  const stolen = await app.inject({
    method: 'POST', url: '/v1/withdrawals',
    headers: { 'content-type': 'application/json', 'x-actor-id': recipientId, 'idempotency-key': 'quote-stolen-20260814' }, payload: body,
  });

  assert.equal(first.statusCode, 201);
  assert.equal(replayWithNewKey.statusCode, 409);
  assert.equal(replayWithNewKey.json().code, 'fee_quote_invalid');
  assert.equal(stolen.statusCode, 409);
  assert.equal(stolen.json().code, 'fee_quote_invalid');
  assert.equal(repository.balanceOf(senderAccountId, 'USDT'), '990000');
  assert.equal(repository.balanceOf(senderFrozenAccountId, 'USDT'), '1010000');
});

test('withdrawal risk controls reject a missing whitelist and a configured amount limit before freezing', async (t) => {
  const { app, repository } = await createFixture({
    withdrawalRiskControls: { dailyLimitAtoms: '1000000', maxPerWithdrawalAtoms: '999999', whitelistCooldownMs: 24 * 60 * 60 * 1000 },
  });
  t.after(() => app.close());
  const limitedQuote = await createWithdrawalFeeQuote(app);
  const limitResponse = await app.inject({
    method: 'POST', url: '/v1/withdrawals',
    headers: { 'content-type': 'application/json', 'x-actor-id': senderId, 'idempotency-key': 'risk-limit-20260814' },
    payload: {
      amount_atoms: '1000000', asset_code: 'USDT', destination_address: '0xabcdeffedcba11223344556677889900',
      fee_quote_id: limitedQuote, from_account_id: senderAccountId, frozen_account_id: senderFrozenAccountId, network: 'ethereum',
    },
  });
  const whitelistQuote = await createWithdrawalFeeQuote(app, '1');
  const whitelistResponse = await app.inject({
    method: 'POST', url: '/v1/withdrawals',
    headers: { 'content-type': 'application/json', 'x-actor-id': senderId, 'idempotency-key': 'risk-whitelist-20260814' },
    payload: {
      amount_atoms: '1', asset_code: 'USDT', destination_address: '0x2222222222222222222222222222222222222222',
      fee_quote_id: whitelistQuote, from_account_id: senderAccountId, frozen_account_id: senderFrozenAccountId, network: 'ethereum',
    },
  });

  assert.equal(limitResponse.statusCode, 409);
  assert.equal(limitResponse.json().code, 'withdrawal_limit_exceeded');
  assert.equal(whitelistResponse.statusCode, 403);
  assert.equal(whitelistResponse.json().code, 'withdrawal_whitelist_missing');
  assert.equal(repository.balanceOf(senderAccountId, 'USDT'), '2000000');
  assert.equal(repository.balanceOf(senderFrozenAccountId, 'USDT'), '0');
});

test('withdrawal freezes funds and public API never exposes settlement or failure controls', async (t) => {
  const { app, repository } = await createFixture();
  t.after(() => app.close());
  const feeQuoteId = await createWithdrawalFeeQuote(app);
  const request = await app.inject({
    method: 'POST', url: '/v1/withdrawals',
    headers: { 'content-type': 'application/json', 'x-actor-id': senderId, 'idempotency-key': 'withdrawal-20260813-001' },
    payload: {
      amount_atoms: '1000000', asset_code: 'USDT', destination_address: '0xabcdeffedcba11223344556677889900',
      fee_quote_id: feeQuoteId,
      from_account_id: senderAccountId, frozen_account_id: senderFrozenAccountId, network: 'ethereum',
    },
  });
  assert.equal(request.statusCode, 201);
  const withdrawalId = request.json().withdrawal_id;
  assert.equal(repository.balanceOf(senderAccountId, 'USDT'), '990000');
  assert.equal(repository.balanceOf(senderFrozenAccountId, 'USDT'), '1010000');

  const premature = await app.inject({
    method: 'POST', url: `/v1/withdrawals/${withdrawalId}/settle`,
    headers: { 'content-type': 'application/json', 'x-actor-id': 'chain-worker-01', 'x-actor-roles': 'chain_worker' },
    payload: { transaction_hash: '0xfedcba11223344556677889900abcdeff' },
  });
  assert.equal(premature.statusCode, 404);

  const selfApproval = await app.inject({
    method: 'POST', url: `/v1/withdrawals/${withdrawalId}/approve`,
    headers: { 'x-actor-id': senderId, 'x-actor-roles': 'finance_reviewer' },
  });
  assert.equal(selfApproval.statusCode, 403);
  assert.equal(selfApproval.json().code, 'self_approval_forbidden');

  const approved = await app.inject({
    method: 'POST', url: `/v1/withdrawals/${withdrawalId}/approve`,
    headers: { 'x-actor-id': 'reviewer-01', 'x-actor-roles': 'finance_reviewer' },
  });
  assert.equal(approved.statusCode, 200);

  const signerFailure = await app.inject({
    method: 'POST', url: `/v1/withdrawals/${withdrawalId}/fail`,
    headers: { 'content-type': 'application/json', 'x-actor-id': 'chain-worker-01', 'x-actor-roles': 'chain_worker' },
    payload: { reason: 'signer rejected the policy-bound request before broadcast' },
  });
  assert.equal(signerFailure.statusCode, 404);

  await repository.failWithdrawal(withdrawalId, 'signer rejected the policy-bound request before broadcast');
  assert.equal(repository.balanceOf(senderAccountId, 'USDT'), '2000000');

  await assert.rejects(() => repository.settleWithdrawal(withdrawalId, '0xfedcba11223344556677889900abcdeff'));
});

test('withdrawals are rejected before any funds freeze when the deployment gate is closed', async (t) => {
  const repository = new InMemoryLedgerRepository();
  repository.seedAsset({ code: 'USDT', decimals: 6 });
  repository.seedChainAsset('ethereum', 'USDT', 12, '0xusdtcontract');
  repository.seedAccount({ id: senderAccountId, ownerId: senderId, accountKind: 'user_available' });
  repository.seedAccount({ id: senderFrozenAccountId, ownerId: senderId, accountKind: 'user_frozen' });
  repository.seedBalance(senderAccountId, 'USDT', '2000000');
  const app = buildApp({
    environment: 'test',
    repository,
    withdrawalFeePolicy: fixedWithdrawalFeePolicy({ 'ethereum:USDT': '10000' }),
    withdrawalsEnabled: false,
  });
  await app.ready();
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/v1/withdrawals',
    headers: { 'content-type': 'application/json', 'x-actor-id': senderId, 'idempotency-key': 'withdrawal-gated-20260814' },
    payload: {
      amount_atoms: '1000000', asset_code: 'USDT', destination_address: '0xabcdeffedcba11223344556677889900',
      fee_quote_id: '3ce3d0e9-01b8-4d72-8f48-f2a000013003',
      from_account_id: senderAccountId, frozen_account_id: senderFrozenAccountId, network: 'ethereum',
    },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().code, 'withdrawals_disabled');
  assert.equal(repository.balanceOf(senderAccountId, 'USDT'), '2000000');
  assert.equal(repository.balanceOf(senderFrozenAccountId, 'USDT'), '0');
});

test('a private worker must persist broadcast before it can settle a withdrawal', async (t) => {
  const { app, repository } = await createFixture();
  t.after(() => app.close());
  const feeQuoteId = await createWithdrawalFeeQuote(app);
  const requested = await app.inject({
    method: 'POST', url: '/v1/withdrawals',
    headers: { 'content-type': 'application/json', 'x-actor-id': senderId, 'idempotency-key': 'withdrawal-20260814-broadcast' },
    payload: {
      amount_atoms: '1000000', asset_code: 'USDT', destination_address: '0xabcdeffedcba11223344556677889900',
      fee_quote_id: feeQuoteId,
      from_account_id: senderAccountId, frozen_account_id: senderFrozenAccountId, network: 'ethereum',
    },
  });
  const withdrawalId = requested.json().withdrawal_id;
  await repository.approveWithdrawal(withdrawalId, 'reviewer-01');
  const chainTransactionHash = '0xfedcba11223344556677889900abcdeff';

  await assert.rejects(() => repository.settleWithdrawal(withdrawalId, chainTransactionHash));
  const broadcast = await repository.markWithdrawalBroadcast(withdrawalId, chainTransactionHash);
  assert.equal(broadcast.status, 'broadcast');
  const settled = await repository.settleWithdrawal(withdrawalId, chainTransactionHash);
  assert.equal(settled.status, 'confirmed');
  assert.equal(repository.balanceOf(senderFrozenAccountId, 'USDT'), '0');
});
