import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../../src/http/app.js';
import { InMemoryLedgerRepository } from '../../src/repositories/in-memory-ledger-repository.js';
import { fixedWithdrawalFeePolicy } from '../../src/services/funding-service.js';

const accountId = '0b6f6cdc-2974-45a0-a2d0-c1282e382771';
const userId = '8bb8cf65-f38e-4d82-a0f3-6c1df4fcf51c';

test('wallet address API derives an address only for the authenticated account owner', async (t) => {
  const repository = new InMemoryLedgerRepository();
  repository.seedAccount({ id: accountId, ownerId: userId, accountKind: 'user_available' });
  const requests: Array<{ accountId: string; network: string; ownerId: string }> = [];
  const app = buildApp({
    environment: 'test',
    repository,
    walletAddresses: {
      allocate: async (input) => {
        requests.push(input);
        return { accountId: input.accountId, address: 'T111111111111111111111111111111111', derivationIndex: 7, id: '0f8fad5b-d9cb-469f-a165-70867728950e', keyVersion: 1, network: input.network, ownerId: input.ownerId };
      },
    },
    withdrawalFeePolicy: fixedWithdrawalFeePolicy({}),
  });
  t.after(() => app.close());

  const result = await app.inject({
    method: 'POST', url: '/v1/wallet-addresses', headers: { 'content-type': 'application/json', 'x-actor-id': userId },
    payload: { account_id: accountId, network: 'tron-shasta' },
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.json().address, 'T111111111111111111111111111111111');
  assert.deepEqual(requests, [{ accountId, network: 'tron-shasta', ownerId: userId }]);

  const forbidden = await app.inject({
    method: 'POST', url: '/v1/wallet-addresses', headers: { 'content-type': 'application/json', 'x-actor-id': 'someone-else' }, payload: { account_id: accountId, network: 'tron-shasta' },
  });
  assert.equal(forbidden.statusCode, 403);
});

test('my wallet endpoint creates the authenticated user\'s available and frozen accounts without accepting account ids from the client', async (t) => {
  const repository = new InMemoryLedgerRepository();
  const app = buildApp({
    environment: 'test',
    repository,
    withdrawalFeePolicy: fixedWithdrawalFeePolicy({}),
  });
  t.after(() => app.close());

  const first = await app.inject({ method: 'GET', url: '/v1/me/wallet', headers: { 'x-actor-id': userId } });
  const replay = await app.inject({ method: 'GET', url: '/v1/me/wallet', headers: { 'x-actor-id': userId } });

  assert.equal(first.statusCode, 200);
  assert.equal(replay.statusCode, 200);
  assert.equal(first.json().available_account_id, replay.json().available_account_id);
  assert.equal(first.json().frozen_account_id, replay.json().frozen_account_id);
  assert.notEqual(first.json().available_account_id, first.json().frozen_account_id);
  assert.equal((await repository.getAccount(first.json().available_account_id)).ownerId, userId);
  assert.equal((await repository.getAccount(first.json().available_account_id)).accountKind, 'user_available');
  assert.equal((await repository.getAccount(first.json().frozen_account_id)).accountKind, 'user_frozen');
});

test('my wallet routes derive the account from the authenticated identity for balances and deposit addresses', async (t) => {
  const repository = new InMemoryLedgerRepository();
  const requests: Array<{ accountId: string; network: string; ownerId: string }> = [];
  const app = buildApp({
    environment: 'test',
    repository,
    walletAddresses: {
      allocate: async (input) => {
        requests.push(input);
        return { accountId: input.accountId, address: 'T111111111111111111111111111111111', derivationIndex: 7, id: '0f8fad5b-d9cb-469f-a165-70867728950e', keyVersion: 1, network: input.network, ownerId: input.ownerId };
      },
    },
    withdrawalFeePolicy: fixedWithdrawalFeePolicy({}),
  });
  t.after(() => app.close());

  const balance = await app.inject({ method: 'GET', url: '/v1/me/balances', headers: { 'x-actor-id': userId } });
  const address = await app.inject({
    method: 'POST', url: '/v1/me/wallet-addresses', headers: { 'content-type': 'application/json', 'x-actor-id': userId }, payload: { network: 'tron-shasta' },
  });

  assert.equal(balance.statusCode, 200);
  assert.deepEqual(balance.json().balances, []);
  assert.equal(address.statusCode, 200);
  assert.equal(address.json().address, 'T111111111111111111111111111111111');
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.ownerId, userId);
  assert.equal(requests[0]?.accountId, balance.json().account_id);
});
