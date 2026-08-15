import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../../src/http/app.js';
import { InMemoryLedgerRepository } from '../../src/repositories/in-memory-ledger-repository.js';
import { fixedWithdrawalFeePolicy } from '../../src/services/funding-service.js';

test('P2P order API derives the buyer, requires idempotency, and never lets a client choose the seller', async (t) => {
  const created: Array<Record<string, string>> = [];
  const app = buildApp({
    environment: 'test',
    repository: new InMemoryLedgerRepository(),
    withdrawalFeePolicy: fixedWithdrawalFeePolicy({}),
    p2pOrders: {
      create: async (input) => {
        created.push(input);
        return {
          adId: input.adId, amountAtoms: input.amountAtoms, assetCode: 'USDT', buyerId: input.buyerId,
          escrowAccountId: 'cb0f868c-8d1f-4e7d-96f5-5d76f6a4f427', fiatCurrency: 'TWD', id: 'c0fba2da-7e5d-4f71-9860-449a4ee47720',
          paymentDeadlineAt: '2030-01-01T00:15:00.000Z', paymentMethodCode: 'bank_transfer', priceAtoms: '32000000', sellerAvailableAccountId: 'd50cce2a-5ae9-4a19-a437-31904101fcfd', sellerId: 'seller-001', status: 'awaiting_payment' as const,
        };
      },
      listForActor: async () => [],
      transition: async () => { throw new Error('not used'); },
    },
  });
  t.after(() => app.close());

  const missingKey = await app.inject({
    method: 'POST', url: '/v1/p2p/orders', headers: { 'content-type': 'application/json', 'x-actor-id': 'buyer-001' },
    payload: { ad_id: 'b73eddda-6bb9-4f88-b529-65d9a2a78d18', amount_atoms: '1000000', seller_id: 'attacker' },
  });
  const createdOrder = await app.inject({
    method: 'POST', url: '/v1/p2p/orders', headers: { 'content-type': 'application/json', 'idempotency-key': 'p2p-order-001', 'x-actor-id': 'buyer-001' },
    payload: { ad_id: 'b73eddda-6bb9-4f88-b529-65d9a2a78d18', amount_atoms: '1000000' },
  });

  assert.equal(missingKey.statusCode, 400);
  assert.equal(createdOrder.statusCode, 201);
  assert.equal(created[0]?.buyerId, 'buyer-001');
  assert.equal(created[0]?.adId, 'b73eddda-6bb9-4f88-b529-65d9a2a78d18');
  assert.equal(created[0]?.amountAtoms, '1000000');
  assert.equal(created[0]?.idempotencyKey, 'p2p-order-001');
  assert.equal(createdOrder.json().order.sellerId, 'seller-001');
});

test('P2P order actions keep the actor and the action server-derived, including arbitrator resolution', async (t) => {
  const actions: Array<Record<string, string | undefined>> = [];
  const order = {
    adId: 'b73eddda-6bb9-4f88-b529-65d9a2a78d18', amountAtoms: '1000000', assetCode: 'USDT', buyerId: 'buyer-001',
    escrowAccountId: 'cb0f868c-8d1f-4e7d-96f5-5d76f6a4f427', fiatCurrency: 'TWD', id: 'c0fba2da-7e5d-4f71-9860-449a4ee47720',
    paymentDeadlineAt: '2030-01-01T00:15:00.000Z', paymentMethodCode: 'bank_transfer', priceAtoms: '32000000', sellerAvailableAccountId: 'd50cce2a-5ae9-4a19-a437-31904101fcfd', sellerId: 'seller-001', status: 'awaiting_release' as const,
  };
  const app = buildApp({
    environment: 'test', repository: new InMemoryLedgerRepository(), withdrawalFeePolicy: fixedWithdrawalFeePolicy({}),
    p2pOrders: {
      create: async () => order,
      listForActor: async () => [order],
      transition: async (input) => {
        actions.push(input);
        return { ...order, status: input.action === 'open_dispute' ? 'disputed' as const : order.status };
      },
    },
  });
  t.after(() => app.close());

  const dispute = await app.inject({
    method: 'POST', url: `/v1/p2p/orders/${order.id}/disputes`,
    headers: { 'content-type': 'application/json', 'idempotency-key': 'p2p-dispute-001', 'x-actor-id': 'buyer-001' },
    payload: { reason_code: 'payment_not_received' },
  });
  const forbidden = await app.inject({
    method: 'POST', url: `/v1/p2p/orders/${order.id}/resolution`,
    headers: { 'content-type': 'application/json', 'idempotency-key': 'p2p-resolution-001', 'x-actor-id': 'buyer-001' },
    payload: { outcome: 'release_to_buyer' },
  });
  const resolved = await app.inject({
    method: 'POST', url: `/v1/p2p/orders/${order.id}/resolution`,
    headers: { 'content-type': 'application/json', 'idempotency-key': 'p2p-resolution-002', 'x-actor-id': 'arb-001', 'x-actor-roles': 'p2p_arbitrator' },
    payload: { outcome: 'release_to_buyer' },
  });

  assert.equal(dispute.statusCode, 200);
  assert.equal(actions[0]?.actorId, 'buyer-001');
  assert.equal(actions[0]?.action, 'open_dispute');
  assert.equal(actions[0]?.reasonCode, 'payment_not_received');
  assert.equal(forbidden.statusCode, 403);
  assert.equal(resolved.statusCode, 200);
  assert.equal(actions[1]?.actorId, 'arb-001');
  assert.equal(actions[1]?.action, 'arbitrator_release_buyer');
});
