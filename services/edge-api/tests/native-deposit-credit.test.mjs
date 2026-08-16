import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { DomainError } from '../../ledger-api/src/domain/errors.ts';
import { authenticateChainOperator } from '../src/native-ledger-auth.ts';
import { createNativeLedgerHandler } from '../src/native-ledger-worker.ts';
import * as nativeRuntime from '../src/native-ledger-runtime.ts';

const officialObservation = {
  amount_atoms: '1000000',
  asset_code: 'USDT',
  block_hash: '0xabc12345',
  block_height: '100',
  confirmation_count: 12,
  contract_identifier: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
  destination_account_id: '11111111-1111-4111-8111-111111111111',
  network: 'ethereum-sepolia',
  output_index: 0,
  transaction_hash: '0x3333333333333333333333333333333333333333333333333333333333333333',
};

const chainOperator = { id: 'chain-operator', roles: ['chain_worker'] };

function depositRequest(body, headers = {}) {
  return new Request('https://ledger.example/v1/deposits/confirmed', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

test('chain operator auth accepts only the dedicated service token and never x-actor-id or a user JWT shape', async () => {
  const env = { CHAIN_OPERATOR_TOKEN: 'chain-operator-token-at-least-16' };
  const actor = await authenticateChainOperator(env, new Headers({ authorization: 'Bearer chain-operator-token-at-least-16' }));
  assert.deepEqual(actor, chainOperator);

  assert.throws(
    () => authenticateChainOperator(env, new Headers({ authorization: 'Bearer not-the-operator-token-16' })),
    (error) => error instanceof DomainError && error.code === 'unauthenticated',
  );
  assert.throws(
    () => authenticateChainOperator({ CHAIN_OPERATOR_TOKEN: 'short' }, new Headers({ authorization: 'Bearer short' })),
    (error) => error instanceof DomainError && error.code === 'chain_operator_unavailable',
  );
  assert.throws(
    () => authenticateChainOperator({}, new Headers({ authorization: 'Bearer chain-operator-token-at-least-16' })),
    (error) => error instanceof DomainError && error.code === 'chain_operator_unavailable',
  );
  assert.throws(
    () => authenticateChainOperator(env, new Headers({
      authorization: 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.e30.sig',
    })),
    (error) => error instanceof DomainError && error.code === 'unauthenticated',
  );
  assert.throws(
    () => authenticateChainOperator(env, new Headers({
      authorization: 'Bearer chain-operator-token-at-least-16',
      'x-actor-id': 'forged-user',
      'x-actor-roles': 'chain_worker',
    })),
    (error) => error instanceof DomainError && error.code === 'unauthenticated',
  );
});

test('deposit credit path does not construct a runtime before a bearer token', async () => {
  let runtimeCalls = 0;
  const handler = createNativeLedgerHandler({
    authenticate: async () => chainOperator,
    createRuntime: async () => {
      runtimeCalls += 1;
      return { handle: async () => Response.json({ reached_runtime: true }) };
    },
  });
  const response = await handler(depositRequest(officialObservation), { LEDGER_API_ENABLED: 'true' });
  assert.equal(response.status, 401);
  assert.equal(runtimeCalls, 0);
});

test('a browser Origin cannot call the chain-operator deposit credit path', async () => {
  let runtimeCalls = 0;
  const handler = createNativeLedgerHandler({
    authenticate: async () => chainOperator,
    createRuntime: async () => {
      runtimeCalls += 1;
      return { handle: async () => Response.json({ reached_runtime: true }) };
    },
  });
  const response = await handler(depositRequest(officialObservation, {
    authorization: 'Bearer chain-operator-token-at-least-16',
    origin: 'https://hidotpay-wallet-ui.lgninhk.workers.dev',
  }), {
    CORS_ALLOWED_ORIGINS: 'https://hidotpay-wallet-ui.lgninhk.workers.dev',
    LEDGER_API_ENABLED: 'true',
  });
  assert.equal(response.status, 403);
  assert.equal(runtimeCalls, 0);
});

test('confirmed deposit router requires chain_worker and credits through FundingService', async () => {
  assert.equal(typeof nativeRuntime.createConfirmedDepositRouter, 'function');
  const calls = [];
  const router = nativeRuntime.createConfirmedDepositRouter({
    confirmDeposit: async (input) => {
      calls.push(input);
      return { created: true, depositId: 'deposit-1', transferId: 'ledger-1' };
    },
  });

  const forbidden = await router.handle(depositRequest(officialObservation), { id: 'user-001', roles: [] });
  assert.equal(forbidden.status, 403);
  assert.deepEqual(await forbidden.json(), { code: 'forbidden', message: '請求無法處理' });
  assert.equal(calls.length, 0);

  const created = await router.handle(depositRequest(officialObservation), chainOperator);
  assert.equal(created.status, 201);
  assert.deepEqual(await created.json(), { deposit_id: 'deposit-1', ledger_transaction_id: 'ledger-1', status: 'credited' });
  assert.equal(calls[0].actorId, 'chain-operator');
  assert.equal(calls[0].network, 'ethereum-sepolia');
  assert.equal(calls[0].destinationAccountId, officialObservation.destination_account_id);
});

test('duplicate confirmed observation does not double-credit', async () => {
  const calls = [];
  const router = nativeRuntime.createConfirmedDepositRouter({
    confirmDeposit: async (input) => {
      calls.push(input);
      return { created: calls.length === 1, depositId: 'deposit-1', transferId: 'ledger-1' };
    },
  });
  const first = await router.handle(depositRequest(officialObservation), chainOperator);
  const replay = await router.handle(depositRequest(officialObservation), chainOperator);
  assert.equal(first.status, 201);
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).deposit_id, 'deposit-1');
  assert.equal(calls.length, 2);
});

test('mainnet and malformed observations are rejected before the ledger repository', async () => {
  let repositoryCalls = 0;
  const router = nativeRuntime.createConfirmedDepositRouter({
    confirmDeposit: async () => {
      repositoryCalls += 1;
      return { created: true, depositId: 'should-not-exist', transferId: 'should-not-exist' };
    },
  });

  const mainnet = await router.handle(depositRequest({ ...officialObservation, network: 'ethereum-mainnet' }), chainOperator);
  assert.equal(mainnet.status, 403);
  assert.equal((await mainnet.json()).code, 'deposit_mainnet_disabled');

  const unofficial = await router.handle(depositRequest({ ...officialObservation, network: 'ethereum' }), chainOperator);
  assert.equal(unofficial.status, 400);
  assert.equal((await unofficial.json()).code, 'invalid_network');

  const extraField = await router.handle(depositRequest({ ...officialObservation, caller: 'forged' }), chainOperator);
  assert.equal(extraField.status, 400);
  assert.deepEqual(await extraField.json(), { code: 'invalid_request', message: '請求格式不正確' });

  const badAccount = await router.handle(depositRequest({ ...officialObservation, destination_account_id: 'not-a-uuid' }), chainOperator);
  assert.equal(badAccount.status, 400);

  const missing = await router.handle(depositRequest({ network: 'ethereum-sepolia' }), chainOperator);
  assert.equal(missing.status, 400);
  assert.equal(repositoryCalls, 0);
});

test('native ledger entry uses chain-operator auth for deposits and never x-actor-id', () => {
  const entry = readFileSync(new URL('../src/native-ledger-entry.ts', import.meta.url), 'utf8');
  const auth = readFileSync(new URL('../src/native-ledger-auth.ts', import.meta.url), 'utf8');
  const runtime = readFileSync(new URL('../src/native-ledger-runtime.ts', import.meta.url), 'utf8');
  assert.match(entry, /authenticateChainOperator/);
  assert.match(entry, /\/v1\/deposits\/confirmed/);
  assert.match(auth, /CHAIN_OPERATOR_TOKEN/);
  assert.match(auth, /timingSafeEqual/);
  assert.match(auth, /x-actor-id/);
  assert.doesNotMatch(auth, /developmentApiKey/);
  assert.match(runtime, /createConfirmedDepositRouter/);
  assert.match(runtime, /FundingService/);
  assert.match(runtime, /confirmDeposit/);
});
