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

async function createFixture() {
  const repository = new InMemoryLedgerRepository();
  repository.seedAsset({ code: 'USDT', decimals: 6 });
  repository.seedChainAsset('ethereum', 'USDT', 12, '0xusdtcontract');
  repository.seedAccount({ id: senderAccountId, ownerId: senderId, accountKind: 'user_available' });
  repository.seedAccount({ id: senderFrozenAccountId, ownerId: senderId, accountKind: 'user_frozen' });
  repository.seedAccount({ id: recipientAccountId, ownerId: recipientId, accountKind: 'user_available' });
  repository.seedAccount({ id: settlementAccountId, ownerId: 'platform:settlement', accountKind: 'platform_settlement' });
  repository.seedAccount({ id: treasuryAccountId, ownerId: 'platform:treasury', accountKind: 'platform_treasury' });
  repository.seedBalance(senderAccountId, 'USDT', '2000000');
  const app = buildApp({ environment: 'test', repository, withdrawalFeePolicy: fixedWithdrawalFeePolicy({ 'ethereum:USDT': '10000' }) });
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

test('withdrawal freezes funds, then settles amount and fee only after approval', async (t) => {
  const { app, repository } = await createFixture();
  t.after(() => app.close());
  const request = await app.inject({
    method: 'POST', url: '/v1/withdrawals',
    headers: { 'content-type': 'application/json', 'x-actor-id': senderId, 'idempotency-key': 'withdrawal-20260813-001' },
    payload: {
      amount_atoms: '1000000', asset_code: 'USDT', destination_address: '0xabcdeffedcba11223344556677889900',
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
  assert.equal(premature.statusCode, 409);

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

  const unsafeRelease = await app.inject({
    method: 'POST', url: `/v1/withdrawals/${withdrawalId}/fail`,
    headers: { 'content-type': 'application/json', 'x-actor-id': 'chain-worker-01', 'x-actor-roles': 'chain_worker' },
    payload: { reason: 'cannot release a withdrawal once it has been approved' },
  });
  assert.equal(unsafeRelease.statusCode, 409);

  const settled = await app.inject({
    method: 'POST', url: `/v1/withdrawals/${withdrawalId}/settle`,
    headers: { 'content-type': 'application/json', 'x-actor-id': 'chain-worker-01', 'x-actor-roles': 'chain_worker' },
    payload: { transaction_hash: '0xfedcba11223344556677889900abcdeff' },
  });
  assert.equal(settled.statusCode, 200);
  assert.equal(repository.balanceOf(senderFrozenAccountId, 'USDT'), '0');
  assert.equal(repository.balanceOf(settlementAccountId, 'USDT'), '1000000');
  assert.equal(repository.balanceOf(treasuryAccountId, 'USDT'), '10000');
});
