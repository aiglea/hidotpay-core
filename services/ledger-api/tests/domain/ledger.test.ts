import assert from 'node:assert/strict';
import test from 'node:test';

import { buildInternalTransfer, sumPostings } from '../../src/domain/ledger.js';

const fromAccountId = '0b6f6cdc-2974-45a0-a2d0-c1282e382771';
const toAccountId = 'a1adc47c-46c4-4482-af47-4f4d608e15c5';

test('internal transfer emits equal debit and credit postings', () => {
  const transaction = buildInternalTransfer({
    assetCode: 'USDT',
    amountAtoms: '1000000',
    fromAccountId,
    toAccountId,
  });

  assert.equal(transaction.postings.length, 2);
  assert.equal(sumPostings(transaction.postings), 0n);
  assert.equal(transaction.postings[0]?.amountAtoms, -1000000n);
  assert.equal(transaction.postings[1]?.amountAtoms, 1000000n);
});

test('internal transfer refuses a self transfer', () => {
  assert.throws(() => buildInternalTransfer({
    assetCode: 'USDT',
    amountAtoms: '1',
    fromAccountId,
    toAccountId: fromAccountId,
  }), /same_account/);
});
