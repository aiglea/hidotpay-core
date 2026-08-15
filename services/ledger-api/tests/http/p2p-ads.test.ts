import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../../src/http/app.js';
import { InMemoryLedgerRepository } from '../../src/repositories/in-memory-ledger-repository.js';
import { fixedWithdrawalFeePolicy } from '../../src/services/funding-service.js';

test('P2P ad API derives the seller from the authenticated identity and only lists active ads', async (t) => {
  const created: Array<Record<string, string>> = [];
  const app = buildApp({
    environment: 'test', repository: new InMemoryLedgerRepository(), withdrawalFeePolicy: fixedWithdrawalFeePolicy({}),
    p2pAds: {
      create: async (input) => { created.push(input); return { ...input, id: '0b6f6cdc-2974-45a0-a2d0-c1282e382771', status: 'active' as const }; },
      listActive: async () => [{ assetCode: 'USDT', fiatCurrency: 'TWD', id: '0b6f6cdc-2974-45a0-a2d0-c1282e382771', maxAmountAtoms: '500000000', minAmountAtoms: '1000000', paymentMethodCode: 'bank_transfer', priceAtoms: '32000000', sellerId: 'seller-001', status: 'active' as const }],
    },
  });
  t.after(() => app.close());
  const create = await app.inject({ method: 'POST', url: '/v1/p2p/ads', headers: { 'content-type': 'application/json', 'x-actor-id': 'seller-001' }, payload: { asset_code: 'USDT', fiat_currency: 'TWD', max_amount_atoms: '500000000', min_amount_atoms: '1000000', payment_method_code: 'bank_transfer', price_atoms: '32000000' } });
  const list = await app.inject({ method: 'GET', url: '/v1/p2p/ads' });
  assert.equal(create.statusCode, 201);
  assert.equal(created[0]?.sellerId, 'seller-001');
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().ads.length, 1);
});

test('P2P payment-method API derives ownership and never returns the submitted account payload', async (t) => {
  const created: Array<Record<string, string>> = [];
  const app = buildApp({
    environment: 'test', repository: new InMemoryLedgerRepository(), withdrawalFeePolicy: fixedWithdrawalFeePolicy({}),
    p2pPaymentMethods: {
      create: async (input) => { created.push(input); return { accountHolderName: input.accountHolderName, currency: input.currency, id: '0b6f6cdc-2974-45a0-a2d0-c1282e382771', maskedReference: '****6789', methodCode: input.methodCode, ownerId: input.ownerId, status: 'pending_review' as const }; },
      listForOwner: async () => [],
    },
  });
  t.after(() => app.close());
  const response = await app.inject({ method: 'POST', url: '/v1/me/p2p/payment-methods', headers: { 'content-type': 'application/json', 'x-actor-id': 'seller-001' }, payload: { account_holder_name: '王小明', account_payload: 'bank-account-0123456789', currency: 'TWD', method_code: 'bank_transfer' } });
  assert.equal(response.statusCode, 201);
  assert.equal(created[0]?.ownerId, 'seller-001');
  assert.equal(created[0]?.accountPayload, 'bank-account-0123456789');
  assert.equal(JSON.stringify(response.json()), JSON.stringify({ payment_method: { accountHolderName: '王小明', currency: 'TWD', id: '0b6f6cdc-2974-45a0-a2d0-c1282e382771', maskedReference: '****6789', methodCode: 'bank_transfer', ownerId: 'seller-001', status: 'pending_review' } }));
});
