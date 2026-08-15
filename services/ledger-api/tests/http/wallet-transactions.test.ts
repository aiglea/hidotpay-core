import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { buildApp } from '../../src/http/app.js';
import { InMemoryLedgerRepository } from '../../src/repositories/in-memory-ledger-repository.js';
import { fixedWithdrawalFeePolicy } from '../../src/services/funding-service.js';

const ownerId = 'wallet-history-owner';
const recipientId = 'wallet-history-recipient';
const ownerAccountId = 'e36ceca4-4627-4b43-9225-02cf3e3b4d84';
const recipientAccountId = 'bd1a9509-a4d0-41b3-b497-4ec13831b0e4';

async function createFixture() {
  let now = new Date('2026-08-15T10:00:00.000Z');
  const repository = new InMemoryLedgerRepository({ clock: () => now });
  repository.seedAsset({ code: 'USDT', decimals: 6 });
  repository.seedAccount({ accountKind: 'user_available', id: ownerAccountId, ownerId });
  repository.seedAccount({ accountKind: 'user_available', id: recipientAccountId, ownerId: recipientId });
  repository.seedBalance(ownerAccountId, 'USDT', '2000000');
  await repository.transferInternal({
    actorId: ownerId,
    amountAtoms: '1000000',
    assetCode: 'USDT',
    fromAccountId: ownerAccountId,
    idempotencyKey: 'wallet-history-first',
    requestHash: randomUUID(),
    toAccountId: recipientAccountId,
  });
  now = new Date('2026-08-15T10:01:00.000Z');
  await repository.transferInternal({
    actorId: ownerId,
    amountAtoms: '500000',
    assetCode: 'USDT',
    fromAccountId: ownerAccountId,
    idempotencyKey: 'wallet-history-second',
    requestHash: randomUUID(),
    toAccountId: recipientAccountId,
  });
  const app = buildApp({ environment: 'test', repository, withdrawalFeePolicy: fixedWithdrawalFeePolicy({}) });
  await app.ready();
  return { app };
}

test('wallet transaction API returns only the authenticated owner history and public fields', async (t) => {
  const { app } = await createFixture();
  t.after(() => app.close());

  const response = await app.inject({
    method: 'GET',
    url: `/v1/me/transactions?limit=1&account_id=${recipientAccountId}`,
    headers: { 'x-actor-id': ownerId },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, 'invalid_request');

  const ownHistory = await app.inject({
    method: 'GET',
    url: '/v1/me/transactions?limit=1',
    headers: { 'x-actor-id': ownerId },
  });

  assert.equal(ownHistory.statusCode, 200);
  assert.deepEqual(Object.keys(ownHistory.json()), ['transactions', 'next_cursor']);
  assert.deepEqual(ownHistory.json().transactions[0], {
    amount_atoms: '500000',
    asset_code: 'USDT',
    created_at: '2026-08-15T10:01:00.000Z',
    direction: 'outgoing',
    id: ownHistory.json().transactions[0].id,
    type: 'internal_transfer',
  });
  assert.ok(ownHistory.json().next_cursor);
});

test('wallet transaction API validates pagination and rejects unauthenticated callers', async (t) => {
  const { app } = await createFixture();
  t.after(() => app.close());

  const unauthenticated = await app.inject({ method: 'GET', url: '/v1/me/transactions?limit=1' });
  assert.equal(unauthenticated.statusCode, 401);
  assert.equal(unauthenticated.json().code, 'unauthenticated');

  const invalidLimit = await app.inject({
    method: 'GET',
    url: '/v1/me/transactions?limit=51',
    headers: { 'x-actor-id': ownerId },
  });
  assert.equal(invalidLimit.statusCode, 400);
  assert.equal(invalidLimit.json().code, 'invalid_request');

  const invalidCursor = await app.inject({
    method: 'GET',
    url: '/v1/me/transactions?limit=1&cursor=not-a-cursor',
    headers: { 'x-actor-id': ownerId },
  });
  assert.equal(invalidCursor.statusCode, 400);
  assert.equal(invalidCursor.json().code, 'invalid_wallet_transaction_cursor');
});

test('wallet transaction API follows the opaque cursor without exposing other transaction data', async (t) => {
  const { app } = await createFixture();
  t.after(() => app.close());

  const firstPage = await app.inject({
    method: 'GET',
    url: '/v1/me/transactions?limit=1',
    headers: { 'x-actor-id': ownerId },
  });
  const secondPage = await app.inject({
    method: 'GET',
    url: `/v1/me/transactions?limit=1&cursor=${encodeURIComponent(firstPage.json().next_cursor)}`,
    headers: { 'x-actor-id': ownerId },
  });

  assert.equal(secondPage.statusCode, 200);
  assert.deepEqual(secondPage.json().transactions[0], {
    amount_atoms: '1000000',
    asset_code: 'USDT',
    created_at: '2026-08-15T10:00:00.000Z',
    direction: 'outgoing',
    id: secondPage.json().transactions[0].id,
    type: 'internal_transfer',
  });
  assert.equal(secondPage.json().next_cursor, null);
});
