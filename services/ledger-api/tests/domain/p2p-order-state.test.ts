import assert from 'node:assert/strict';
import test from 'node:test';

import { DomainError } from '../../src/domain/errors.js';
import { P2P_TIMEOUT_ACTOR, P2POrder, transitionP2POrder } from '../../src/domain/p2p.js';

const created: P2POrder = {
  assetCode: 'USDT',
  buyerId: 'buyer-001',
  id: '0b6f6cdc-2974-45a0-a2d0-c1282e382771',
  sellerId: 'seller-001',
  status: 'awaiting_payment',
};

test('P2P order permits only the escrow-safe payment, release, cancellation and dispute transitions', () => {
  assert.equal(transitionP2POrder(created, 'buyer_marked_paid', 'buyer-001').status, 'awaiting_release');
  assert.equal(transitionP2POrder({ ...created, status: 'awaiting_release' }, 'seller_release', 'seller-001').status, 'released');
  assert.equal(transitionP2POrder(created, 'seller_cancel', 'seller-001').status, 'cancelled');
  assert.equal(transitionP2POrder({ ...created, status: 'awaiting_release' }, 'open_dispute', 'buyer-001').status, 'disputed');
  assert.equal(transitionP2POrder({ ...created, status: 'disputed' }, 'arbitrator_release_buyer', 'finance-reviewer-001').status, 'released');
  assert.equal(transitionP2POrder({ ...created, status: 'disputed' }, 'arbitrator_refund_seller', 'finance-reviewer-001').status, 'cancelled');
  assert.equal(transitionP2POrder(created, 'system_timeout_refund', P2P_TIMEOUT_ACTOR).status, 'cancelled');
});

test('P2P order refuses a buyer release, self-dealing, and any transition after funds are settled', () => {
  assert.throws(() => transitionP2POrder(created, 'seller_release', 'buyer-001'), DomainError);
  assert.throws(() => transitionP2POrder({ ...created, buyerId: 'seller-001' }, 'buyer_marked_paid', 'seller-001'), DomainError);
  assert.throws(() => transitionP2POrder({ ...created, status: 'released' }, 'open_dispute', 'buyer-001'), DomainError);
  assert.throws(() => transitionP2POrder(created, 'system_timeout_refund', 'buyer-001'), DomainError);
});
