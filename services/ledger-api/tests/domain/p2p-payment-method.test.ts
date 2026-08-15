import assert from 'node:assert/strict';
import test from 'node:test';

import { DomainError } from '../../src/domain/errors.js';
import { validateP2PPaymentMethod } from '../../src/domain/p2p-payment-method.js';

test('P2P payment method accepts a minimal bank transfer identity without account data in its label', () => {
  assert.deepEqual(validateP2PPaymentMethod({
    accountHolderName: '王小明',
    accountReference: '012-***-6789',
    currency: 'TWD',
    methodCode: 'bank_transfer',
    ownerId: 'user-001',
  }), {
    accountHolderName: '王小明', accountReference: '012-***-6789', currency: 'TWD', methodCode: 'bank_transfer', ownerId: 'user-001',
  });
});

test('P2P payment method rejects a full bank account number and unsupported method', () => {
  assert.throws(() => validateP2PPaymentMethod({ accountHolderName: '王小明', accountReference: '012345678901234', currency: 'TWD', methodCode: 'bank_transfer', ownerId: 'user-001' }), DomainError);
  assert.throws(() => validateP2PPaymentMethod({ accountHolderName: '王小明', accountReference: '****6789', currency: 'TWD', methodCode: 'crypto_wallet', ownerId: 'user-001' }), DomainError);
});
