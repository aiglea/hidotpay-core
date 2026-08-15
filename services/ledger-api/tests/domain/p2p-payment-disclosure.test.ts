import assert from 'node:assert/strict';
import test from 'node:test';

import { DomainError } from '../../src/domain/errors.js';
import { requireP2PPaymentDisclosure } from '../../src/domain/p2p-payment-disclosure.js';

test('only the buyer may view payment details while a P2P order is active', () => {
  assert.doesNotThrow(() => requireP2PPaymentDisclosure({ actorId: 'buyer', buyerId: 'buyer', status: 'awaiting_payment' }));
  assert.throws(() => requireP2PPaymentDisclosure({ actorId: 'seller', buyerId: 'buyer', status: 'awaiting_payment' }), DomainError);
  assert.throws(() => requireP2PPaymentDisclosure({ actorId: 'buyer', buyerId: 'buyer', status: 'cancelled' }), DomainError);
});
