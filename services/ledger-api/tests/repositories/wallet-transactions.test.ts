import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { decodeWalletTransactionCursor, encodeWalletTransactionCursor } from '../../src/domain/wallet-transaction-cursor.js';
import { InMemoryLedgerRepository } from '../../src/repositories/in-memory-ledger-repository.js';

const ownerId = 'a55efebe-c9f7-44f9-9b17-217d1744b9d9';
const recipientId = 'c3738f6d-3e7c-4cfa-b5f3-6dd2a7b8da1c';
const ownerAccountId = 'e36ceca4-4627-4b43-9225-02cf3e3b4d84';
const recipientAccountId = 'bd1a9509-a4d0-41b3-b497-4ec13831b0e4';
const unrelatedAccountId = '6b9c84dc-b0ea-4cd6-9a0c-ddb7aa253978';

function createRepository(clock: () => Date): InMemoryLedgerRepository {
  const repository = new InMemoryLedgerRepository({ clock });
  repository.seedAsset({ code: 'USDT', decimals: 6 });
  repository.seedAccount({ accountKind: 'user_available', id: ownerAccountId, ownerId });
  repository.seedAccount({ accountKind: 'user_available', id: recipientAccountId, ownerId: recipientId });
  repository.seedAccount({ accountKind: 'user_available', id: unrelatedAccountId, ownerId: randomUUID() });
  repository.seedBalance(ownerAccountId, 'USDT', '2000000');
  return repository;
}

test('wallet transactions are descending, seek-paginated, signed, isolated, and returned as copies', async () => {
  let now = new Date('2026-08-15T10:00:00.000Z');
  const repository = createRepository(() => now);
  const first = await repository.transferInternal({
    actorId: ownerId,
    amountAtoms: '1000000',
    assetCode: 'USDT',
    fromAccountId: ownerAccountId,
    idempotencyKey: 'history-first',
    requestHash: randomUUID(),
    toAccountId: recipientAccountId,
  });
  now = new Date('2026-08-15T10:01:00.000Z');
  const second = await repository.transferInternal({
    actorId: ownerId,
    amountAtoms: '500000',
    assetCode: 'USDT',
    fromAccountId: ownerAccountId,
    idempotencyKey: 'history-second',
    requestHash: randomUUID(),
    toAccountId: recipientAccountId,
  });

  const firstPage = await repository.listWalletTransactions(ownerAccountId, { limit: 1 });
  assert.deepEqual(firstPage.transactions, [{
    amountAtoms: '500000',
    assetCode: 'USDT',
    createdAt: '2026-08-15T10:01:00.000Z',
    direction: 'outgoing',
    id: second.transferId,
    type: 'internal_transfer',
  }]);
  assert.ok(firstPage.nextCursor);

  const secondPage = await repository.listWalletTransactions(ownerAccountId, { cursor: firstPage.nextCursor, limit: 1 });
  assert.deepEqual(secondPage, {
    transactions: [{
      amountAtoms: '1000000',
      assetCode: 'USDT',
      createdAt: '2026-08-15T10:00:00.000Z',
      direction: 'outgoing',
      id: first.transferId,
      type: 'internal_transfer',
    }],
  });

  const recipientPage = await repository.listWalletTransactions(recipientAccountId, { limit: 1 });
  assert.deepEqual(recipientPage.transactions[0], {
    amountAtoms: '500000',
    assetCode: 'USDT',
    createdAt: '2026-08-15T10:01:00.000Z',
    direction: 'incoming',
    id: second.transferId,
    type: 'internal_transfer',
  });
  assert.deepEqual(await repository.listWalletTransactions(unrelatedAccountId, { limit: 20 }), { transactions: [] });

  (firstPage.transactions[0] as { amountAtoms: string }).amountAtoms = '1';
  assert.equal((await repository.listWalletTransactions(ownerAccountId, { limit: 1 })).transactions[0]?.amountAtoms, '500000');
});

test('wallet transaction cursors round trip and reject malformed or non-canonical values', () => {
  const value = { createdAt: '2026-08-15T10:01:00.000Z', id: '51e2546c-9177-4fdb-9b0b-9e0d5902230f' };
  assert.deepEqual(decodeWalletTransactionCursor(encodeWalletTransactionCursor(value)), value);

  assert.throws(() => decodeWalletTransactionCursor('not-a-cursor'), { code: 'invalid_wallet_transaction_cursor' });
  const malformed = Buffer.from(JSON.stringify({ ...value, createdAt: '2026-08-15T18:01:00+08:00' })).toString('base64url');
  assert.throws(() => decodeWalletTransactionCursor(malformed), { code: 'invalid_wallet_transaction_cursor' });
});
