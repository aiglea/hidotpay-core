import assert from 'node:assert/strict';
import test from 'node:test';

import { DomainError } from '../../src/domain/errors.js';
import { validateP2PAd, validateP2POrderAmount } from '../../src/domain/p2p-ad.js';

const ad = {
  assetCode: 'USDT', fiatCurrency: 'TWD', maxAmountAtoms: '500000000', minAmountAtoms: '1000000', paymentMethodCode: 'bank_transfer', priceAtoms: '32000000', sellerId: 'seller-001',
};

test('P2P ad accepts a fixed asset, fiat currency, price, limits, and approved payment method code', () => {
  assert.deepEqual(validateP2PAd(ad), ad);
  assert.equal(validateP2POrderAmount(ad, '1000000'), '1000000');
  assert.equal(validateP2POrderAmount(ad, '500000000'), '500000000');
});

test('P2P ad refuses malformed payment data and amounts outside the immutable advertised limits', () => {
  assert.throws(() => validateP2PAd({ ...ad, paymentMethodCode: 'bank account 123456789' }), DomainError);
  assert.throws(() => validateP2PAd({ ...ad, maxAmountAtoms: '999999' }), DomainError);
  assert.throws(() => validateP2POrderAmount(ad, '999999'), DomainError);
  assert.throws(() => validateP2POrderAmount(ad, '500000001'), DomainError);
});
