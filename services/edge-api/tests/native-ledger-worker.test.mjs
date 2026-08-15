import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { DomainError } from '../../ledger-api/src/domain/errors.ts';
import { requestHash } from '../../ledger-api/src/domain/idempotency.ts';
import { nativeErrorResponse } from '../src/native-response.ts';
import { createNativeLedgerHandler } from '../src/native-ledger-worker.ts';
import * as nativeRuntime from '../src/native-ledger-runtime.ts';

const enabledEnv = {
  HYPERDRIVE: { connectionString: 'postgres://hyperdrive-only' },
  LEDGER_API_ENABLED: 'true',
};

test('does not construct a runtime before a bearer token and the explicit API gate', async () => {
  let runtimeCalls = 0;
  const handler = createNativeLedgerHandler({
    authenticate: async () => ({ id: 'actor-001' }),
    createRuntime: async () => {
      runtimeCalls += 1;
      return { handle: async () => Response.json({ reached_runtime: true }) };
    },
  });

  const unauthenticated = await handler(new Request('https://wallet.example/v1/me/wallet'), enabledEnv);
  assert.equal(unauthenticated.status, 401);
  assert.equal(runtimeCalls, 0);

  const disabled = await handler(new Request('https://wallet.example/v1/me/wallet', {
    headers: { authorization: 'Bearer valid-token' },
  }), { ...enabledEnv, LEDGER_API_ENABLED: 'false' });
  assert.equal(disabled.status, 503);
  assert.equal(runtimeCalls, 0);
});

test('passes the Worker binding to the runtime only after authorization and the API gate', async () => {
  let receivedEnv;
  const handler = createNativeLedgerHandler({
    authenticate: async () => ({ id: 'actor-001' }),
    createRuntime: async (env) => {
      receivedEnv = env;
      return { handle: async () => Response.json({ reached_runtime: true }) };
    },
  });

  const response = await handler(new Request('https://wallet.example/v1/me/wallet', {
    headers: { authorization: 'Bearer valid-token' },
  }), enabledEnv);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reached_runtime: true });
  assert.equal(receivedEnv, enabledEnv);
});

test('fails closed when an enabled runtime cannot be initialized', async () => {
  const handler = createNativeLedgerHandler({
    authenticate: async () => ({ id: 'actor-001' }),
    createRuntime: async () => {
      throw new Error('runtime configuration missing');
    },
  });

  const response = await handler(new Request('https://wallet.example/v1/me/wallet', {
    headers: { authorization: 'Bearer valid-token' },
  }), enabledEnv);

  assert.equal(response.status, 503);
  assert.equal(await response.text(), 'Service Unavailable');
});

test('rejects an invalid bearer token before constructing the runtime', async () => {
  let runtimeCalls = 0;
  const handler = createNativeLedgerHandler({
    authenticate: async () => { throw new DomainError('unauthenticated'); },
    createRuntime: async () => {
      runtimeCalls += 1;
      return { handle: async () => Response.json({ reached_runtime: true }) };
    },
  });

  const response = await handler(new Request('https://wallet.example/v1/me/wallet', {
    headers: { authorization: 'Bearer forged-token' },
  }), enabledEnv);

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { code: 'unauthenticated', message: '請求無法處理' });
  assert.equal(runtimeCalls, 0);
});

test('uses the production Logto verifier and never accepts test actor headers in a Worker', () => {
  const path = new URL('../src/native-ledger-auth.ts', import.meta.url);
  assert.equal(existsSync(path), true);
  const source = readFileSync(path, 'utf8');
  assert.match(source, /createAuthenticator/);
  assert.match(source, /environment:\s*'production'/);
  assert.match(source, /LOGTO_ISSUER/);
  assert.match(source, /LOGTO_AUDIENCE/);
  assert.match(source, /Object\.fromEntries\(headers\.entries\(\)\)/);
  assert.doesNotMatch(source, /x-actor-id|developmentApiKey/);
});

test('builds read-only wallet access only from the Hyperdrive binding and closes each database pool', () => {
  const path = new URL('../src/native-ledger-runtime.ts', import.meta.url);
  assert.equal(existsSync(path), true);
  const source = readFileSync(path, 'utf8');
  assert.match(source, /HYPERDRIVE\.connectionString/);
  assert.match(source, /new Pool/);
  assert.match(source, /await pool\.end\(\)/);
  assert.match(source, /'\/v1\/me\/wallet'/);
  assert.match(source, /'\/v1\/me\/balances'/);
  assert.match(source, /accounts/);
  assert.doesNotMatch(source, /DATABASE_URL|PRIVATE_KEY|MNEMONIC|SEED/i);
});

test('read-only wallet routes expose only the authenticated owner\'s account and balances', async () => {
  assert.equal(typeof nativeRuntime.createReadOnlyWalletRouter, 'function');
  const calls = [];
  const router = nativeRuntime.createReadOnlyWalletRouter({
    ensureUserWallet: async (ownerId) => {
      calls.push(['wallet', ownerId]);
      return {
        availableAccount: { accountKind: 'user_available', id: '11111111-1111-4111-8111-111111111111', ownerId, status: 'active' },
        frozenAccount: { accountKind: 'user_frozen', id: '22222222-2222-4222-8222-222222222222', ownerId, status: 'active' },
      };
    },
    getAccount: async (id) => ({ accountKind: 'user_available', id, ownerId: 'other-user', status: 'active' }),
    getBalances: async (accountId) => {
      calls.push(['balances', accountId]);
      return [{ assetCode: 'USDT', balanceAtoms: '1700000' }];
    },
  });

  const actor = { id: 'actor-001', roles: [] };
  const wallet = await router.handle(new Request('https://wallet.example/v1/me/wallet'), actor);
  assert.deepEqual(await wallet.json(), {
    available_account_id: '11111111-1111-4111-8111-111111111111',
    frozen_account_id: '22222222-2222-4222-8222-222222222222',
    status: 'active',
  });

  const balances = await router.handle(new Request('https://wallet.example/v1/me/balances'), actor);
  assert.deepEqual(await balances.json(), {
    account_id: '11111111-1111-4111-8111-111111111111',
    balances: [{ assetCode: 'USDT', balanceAtoms: '1700000' }],
  });

  const crossOwner = await router.handle(new Request('https://wallet.example/v1/accounts/33333333-3333-4333-8333-333333333333/balances'), actor);
  assert.equal(crossOwner.status, 403);
  assert.deepEqual(await crossOwner.json(), { code: 'account_not_owned', message: '請求無法處理' });
  assert.deepEqual(calls, [
    ['wallet', 'actor-001'],
    ['wallet', 'actor-001'],
    ['balances', '11111111-1111-4111-8111-111111111111'],
  ]);
});

test('an unavailable Logto issuer is reported as a retryable service outage', async () => {
  const response = nativeErrorResponse(new DomainError('authentication_unavailable'));
  assert.ok(response);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: 'authentication_unavailable', message: '請求無法處理' });

  const fastifyErrors = readFileSync(new URL('../../ledger-api/src/http/errors.ts', import.meta.url), 'utf8');
  assert.match(fastifyErrors, /authentication_unavailable:\s*503/);
});

test('internal transfer derives its source only from the authenticated wallet', async () => {
  assert.equal(typeof nativeRuntime.createInternalTransferRouter, 'function');
  const calls = [];
  const router = nativeRuntime.createInternalTransferRouter({
    ensureUserWallet: async (ownerId) => ({
      availableAccount: { accountKind: 'user_available', id: '11111111-1111-4111-8111-111111111111', ownerId, status: 'active' },
      frozenAccount: { accountKind: 'user_frozen', id: '22222222-2222-4222-8222-222222222222', ownerId, status: 'active' },
    }),
    transferInternal: async (input) => {
      calls.push(input);
      return { created: true, transferId: 'transfer-001' };
    },
  });

  const response = await router.handle(new Request('https://wallet.example/v1/me/internal-transfers', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'internal-transfer-001' },
    body: JSON.stringify({
      amount_atoms: '1000000', asset_code: 'USDT', recipient_wallet_id: '33333333-3333-4333-8333-333333333333',
    }),
  }), { id: 'actor-001', roles: [] });

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { status: 'committed', transfer_id: 'transfer-001' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].actorId, 'actor-001');
  assert.equal(calls[0].fromAccountId, '11111111-1111-4111-8111-111111111111');
  assert.equal(calls[0].toAccountId, '33333333-3333-4333-8333-333333333333');
  assert.equal(calls[0].amountAtoms, '1000000');
});

test('internal transfer rejects a client-supplied source account before it can reach the ledger', async () => {
  assert.equal(typeof nativeRuntime.createInternalTransferRouter, 'function');
  let transferCalls = 0;
  const router = nativeRuntime.createInternalTransferRouter({
    ensureUserWallet: async (ownerId) => ({
      availableAccount: { accountKind: 'user_available', id: '11111111-1111-4111-8111-111111111111', ownerId, status: 'active' },
      frozenAccount: { accountKind: 'user_frozen', id: '22222222-2222-4222-8222-222222222222', ownerId, status: 'active' },
    }),
    transferInternal: async () => {
      transferCalls += 1;
      return { created: true, transferId: 'should-not-exist' };
    },
  });

  const response = await router.handle(new Request('https://wallet.example/v1/me/internal-transfers', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'internal-transfer-002' },
    body: JSON.stringify({
      amount_atoms: '1000000', asset_code: 'USDT', from_account_id: 'attacker-controlled', recipient_wallet_id: '33333333-3333-4333-8333-333333333333',
    }),
  }), { id: 'actor-001', roles: [] });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { code: 'invalid_request', message: '請求格式不正確' });
  assert.equal(transferCalls, 0);
});

test('direct internal transfer preserves the authenticated actor for the existing ownership check', async () => {
  assert.equal(typeof nativeRuntime.createInternalTransferRouter, 'function');
  const calls = [];
  const router = nativeRuntime.createInternalTransferRouter({
    ensureUserWallet: async () => {
      throw new Error('the direct route must not provision a wallet');
    },
    transferInternal: async (input) => {
      calls.push(input);
      return { created: false, transferId: 'transfer-replayed' };
    },
  });

  const response = await router.handle(new Request('https://wallet.example/v1/internal-transfers', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'internal-transfer-003' },
    body: JSON.stringify({
      amount_atoms: '2500000',
      asset_code: 'USDT',
      from_account_id: '11111111-1111-4111-8111-111111111111',
      to_account_id: '33333333-3333-4333-8333-333333333333',
    }),
  }), { id: 'actor-001', roles: [] });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'committed', transfer_id: 'transfer-replayed' });
  assert.deepEqual(calls, [{
    actorId: 'actor-001',
    amountAtoms: '2500000',
    assetCode: 'USDT',
    fromAccountId: '11111111-1111-4111-8111-111111111111',
    idempotencyKey: 'internal-transfer-003',
    requestHash: requestHash({
      amount_atoms: '2500000',
      asset_code: 'USDT',
      from_account_id: '11111111-1111-4111-8111-111111111111',
      to_account_id: '33333333-3333-4333-8333-333333333333',
    }),
    toAccountId: '33333333-3333-4333-8333-333333333333',
  }]);
});

test('an invalid internal-transfer idempotency key cannot provision a wallet or reach the ledger', async () => {
  assert.equal(typeof nativeRuntime.createInternalTransferRouter, 'function');
  let walletCalls = 0;
  let transferCalls = 0;
  const router = nativeRuntime.createInternalTransferRouter({
    ensureUserWallet: async () => {
      walletCalls += 1;
      throw new Error('must not provision a wallet for invalid input');
    },
    transferInternal: async () => {
      transferCalls += 1;
      throw new Error('must not reach the ledger for invalid input');
    },
  });

  const response = await router.handle(new Request('https://wallet.example/v1/me/internal-transfers', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'bad' },
    body: JSON.stringify({ amount_atoms: '2500000', asset_code: 'USDT', recipient_wallet_id: '33333333-3333-4333-8333-333333333333' }),
  }), { id: 'actor-001', roles: [] });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { code: 'invalid_idempotency_key', message: '請求無法處理' });
  assert.equal(walletCalls, 0);
  assert.equal(transferCalls, 0);
});

test('withdrawal fee quote is bound to the authenticated actor and uses the configured fee policy', async () => {
  assert.equal(typeof nativeRuntime.createWithdrawalFeeQuoteRouter, 'function');
  const quoteCalls = [];
  const router = nativeRuntime.createWithdrawalFeeQuoteRouter({
    createWithdrawalFeeQuote: async (input) => {
      quoteCalls.push(input);
      return { expiresAt: '2026-08-15T00:05:00.000Z', feeAtoms: '1500000', id: '44444444-4444-4444-8444-444444444444' };
    },
  }, {
    quote: (input) => {
      assert.deepEqual(input, { amountAtoms: '2500000', assetCode: 'USDT', network: 'tron' });
      return { feeAtoms: '1500000', quoteId: 'tron-usdt-fee' };
    },
  });

  const response = await router.handle(new Request('https://wallet.example/v1/withdrawal-fee-quotes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ amount_atoms: '2500000', asset_code: 'USDT', network: 'tron' }),
  }), { id: 'actor-001', roles: [] });

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    expires_at: '2026-08-15T00:05:00.000Z',
    fee_atoms: '1500000',
    fee_quote_id: '44444444-4444-4444-8444-444444444444',
  });
  assert.equal(quoteCalls.length, 1);
  const [quoteCall] = quoteCalls;
  assert.equal(quoteCall.amountAtoms, '2500000');
  assert.equal(quoteCall.assetCode, 'USDT');
  assert.equal(quoteCall.feeAtoms, '1500000');
  assert.equal(quoteCall.network, 'tron');
  assert.equal(quoteCall.userId, 'actor-001');
  assert.ok(Date.parse(quoteCall.expiresAt) > Date.now());
});

test('P2P ads derive the seller from the authenticated actor and expose only active listings', async () => {
  assert.equal(typeof nativeRuntime.createP2PAdsRouter, 'function');
  const created = [];
  const router = nativeRuntime.createP2PAdsRouter({
    create: async (input) => {
      created.push(input);
      return { ...input, id: '55555555-5555-4555-8555-555555555555', status: 'active' };
    },
    listActive: async () => [{
      assetCode: 'USDT', fiatCurrency: 'TWD', id: '66666666-6666-4666-8666-666666666666', maxAmountAtoms: '10000000', minAmountAtoms: '1000000', paymentMethodCode: 'bank_transfer', priceAtoms: '33000000', sellerId: 'seller-001', status: 'active',
    }],
  });

  const actor = { id: 'actor-001', roles: [] };
  const createdResponse = await router.handle(new Request('https://wallet.example/v1/p2p/ads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ asset_code: 'USDT', fiat_currency: 'TWD', max_amount_atoms: '10000000', min_amount_atoms: '1000000', payment_method_code: 'bank_transfer', price_atoms: '33000000' }),
  }), actor);
  assert.equal(createdResponse.status, 201);
  assert.equal((await createdResponse.json()).ad.sellerId, 'actor-001');
  assert.deepEqual(created, [{
    assetCode: 'USDT', fiatCurrency: 'TWD', maxAmountAtoms: '10000000', minAmountAtoms: '1000000', paymentMethodCode: 'bank_transfer', priceAtoms: '33000000', sellerId: 'actor-001',
  }]);

  const listedResponse = await router.handle(new Request('https://wallet.example/v1/p2p/ads'), actor);
  assert.equal(listedResponse.status, 200);
  assert.deepEqual(await listedResponse.json(), { ads: [{
    assetCode: 'USDT', fiatCurrency: 'TWD', id: '66666666-6666-4666-8666-666666666666', maxAmountAtoms: '10000000', minAmountAtoms: '1000000', paymentMethodCode: 'bank_transfer', priceAtoms: '33000000', sellerId: 'seller-001', status: 'active',
  }] });
});

test('P2P order creation derives the buyer and preserves the idempotency request hash', async () => {
  assert.equal(typeof nativeRuntime.createP2POrdersRouter, 'function');
  const created = [];
  const router = nativeRuntime.createP2POrdersRouter({
    create: async (input) => {
      created.push(input);
      return {
        adId: input.adId, amountAtoms: input.amountAtoms, assetCode: 'USDT', buyerId: input.buyerId,
        escrowAccountId: '11111111-1111-4111-8111-111111111111', fiatCurrency: 'TWD', id: '22222222-2222-4222-8222-222222222222',
        paymentDeadlineAt: '2030-01-01T00:15:00.000Z', paymentMethodCode: 'bank_transfer', priceAtoms: '33000000', sellerAvailableAccountId: '33333333-3333-4333-8333-333333333333', sellerId: 'seller-001', status: 'awaiting_payment',
      };
    },
    listForActor: async (actorId) => [{
      adId: '44444444-4444-4444-8444-444444444444', amountAtoms: '1000000', assetCode: 'USDT', buyerId: actorId,
      escrowAccountId: '55555555-5555-4555-8555-555555555555', fiatCurrency: 'TWD', id: '66666666-6666-4666-8666-666666666666',
      paymentDeadlineAt: '2030-01-01T00:15:00.000Z', paymentMethodCode: 'bank_transfer', priceAtoms: '33000000', sellerAvailableAccountId: '77777777-7777-4777-8777-777777777777', sellerId: 'seller-001', status: 'awaiting_payment',
    }],
  });
  const actor = { id: 'buyer-001', roles: [] };
  const response = await router.handle(new Request('https://wallet.example/v1/p2p/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'p2p-order-001' },
    body: JSON.stringify({ ad_id: '44444444-4444-4444-8444-444444444444', amount_atoms: '1000000' }),
  }), actor);

  assert.equal(response.status, 201);
  assert.equal((await response.json()).order.buyerId, 'buyer-001');
  assert.deepEqual(created, [{
    adId: '44444444-4444-4444-8444-444444444444', amountAtoms: '1000000', buyerId: 'buyer-001', idempotencyKey: 'p2p-order-001',
    requestHash: requestHash({ ad_id: '44444444-4444-4444-8444-444444444444', amount_atoms: '1000000' }),
  }]);

  const listed = await router.handle(new Request('https://wallet.example/v1/p2p/orders'), actor);
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).orders[0].buyerId, 'buyer-001');
});

test('P2P order actions derive their action and actor, and reserve resolution for arbitrators', async () => {
  assert.equal(typeof nativeRuntime.createP2POrderActionsRouter, 'function');
  const transitions = [];
  const router = nativeRuntime.createP2POrderActionsRouter({
    transition: async (input) => {
      transitions.push(input);
      return {
        adId: '11111111-1111-4111-8111-111111111111', amountAtoms: '1000000', assetCode: 'USDT', buyerId: 'buyer-001',
        escrowAccountId: '22222222-2222-4222-8222-222222222222', fiatCurrency: 'TWD', id: input.orderId,
        paymentDeadlineAt: '2030-01-01T00:15:00.000Z', paymentMethodCode: 'bank_transfer', priceAtoms: '33000000', sellerAvailableAccountId: '33333333-3333-4333-8333-333333333333', sellerId: 'seller-001', status: input.action === 'open_dispute' ? 'disputed' : 'released',
      };
    },
  });
  const orderId = '44444444-4444-4444-8444-444444444444';
  const disputed = await router.handle(new Request(`https://wallet.example/v1/p2p/orders/${orderId}/disputes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'p2p-dispute-001' },
    body: JSON.stringify({ reason_code: 'payment_not_received' }),
  }), { id: 'buyer-001', roles: [] });
  assert.equal(disputed.status, 200);
  assert.equal((await disputed.json()).order.status, 'disputed');
  assert.deepEqual(transitions[0], {
    action: 'open_dispute', actorId: 'buyer-001', idempotencyKey: 'p2p-dispute-001', orderId, reasonCode: 'payment_not_received',
    requestHash: requestHash({ action: 'open_dispute', order_id: orderId, reason_code: 'payment_not_received' }),
  });

  const forbidden = await router.handle(new Request(`https://wallet.example/v1/p2p/orders/${orderId}/resolution`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'p2p-resolution-001' },
    body: JSON.stringify({ outcome: 'release_to_buyer' }),
  }), { id: 'buyer-001', roles: [] });
  assert.equal(forbidden.status, 403);
  assert.deepEqual(await forbidden.json(), { code: 'forbidden', message: '請求無法處理' });
  assert.equal(transitions.length, 1);

  const resolved = await router.handle(new Request(`https://wallet.example/v1/p2p/orders/${orderId}/resolution`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'p2p-resolution-002' },
    body: JSON.stringify({ outcome: 'release_to_buyer' }),
  }), { id: 'arb-001', roles: ['p2p_arbitrator'] });
  assert.equal(resolved.status, 200);
  assert.equal((await resolved.json()).order.status, 'released');
  assert.equal(transitions[1].action, 'arbitrator_release_buyer');
  assert.equal(transitions[1].actorId, 'arb-001');
});

test('P2P payment methods derive the owner and never return submitted account details', async () => {
  assert.equal(typeof nativeRuntime.createP2PPaymentMethodsRouter, 'function');
  const created = [];
  const router = nativeRuntime.createP2PPaymentMethodsRouter({
    create: async (input) => {
      created.push(input);
      return { accountHolderName: input.accountHolderName, currency: input.currency, id: '11111111-1111-4111-8111-111111111111', maskedReference: '****2345', methodCode: input.methodCode, ownerId: input.ownerId, status: 'pending_review' };
    },
    listForOwner: async (ownerId) => [{ accountHolderName: '王小明', currency: 'TWD', id: '22222222-2222-4222-8222-222222222222', maskedReference: '****2345', methodCode: 'bank_transfer', ownerId, status: 'active' }],
  });
  const actor = { id: 'actor-001', roles: [] };
  const response = await router.handle(new Request('https://wallet.example/v1/me/p2p/payment-methods', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account_holder_name: '王小明', account_payload: 'bank-account-9876543212345', currency: 'TWD', method_code: 'bank_transfer' }),
  }), actor);
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.deepEqual(payload, { payment_method: { accountHolderName: '王小明', currency: 'TWD', id: '11111111-1111-4111-8111-111111111111', maskedReference: '****2345', methodCode: 'bank_transfer', ownerId: 'actor-001', status: 'pending_review' } });
  assert.doesNotMatch(JSON.stringify(payload), /9876543212345/);
  assert.deepEqual(created, [{ accountHolderName: '王小明', accountPayload: 'bank-account-9876543212345', currency: 'TWD', methodCode: 'bank_transfer', ownerId: 'actor-001' }]);

  const listed = await router.handle(new Request('https://wallet.example/v1/me/p2p/payment-methods'), actor);
  assert.equal(listed.status, 200);
  assert.deepEqual(await listed.json(), { payment_methods: [{ accountHolderName: '王小明', currency: 'TWD', id: '22222222-2222-4222-8222-222222222222', maskedReference: '****2345', methodCode: 'bank_transfer', ownerId: 'actor-001', status: 'active' }] });
});

test('my wallet address derives the account from the authenticated actor and exposes only a public address', async () => {
  assert.equal(typeof nativeRuntime.createWalletAddressRouter, 'function');
  const allocations = [];
  const router = nativeRuntime.createWalletAddressRouter({
    ensureUserWallet: async (ownerId) => ({
      availableAccount: { accountKind: 'user_available', id: '11111111-1111-4111-8111-111111111111', ownerId, status: 'active' },
      frozenAccount: { accountKind: 'user_frozen', id: '22222222-2222-4222-8222-222222222222', ownerId, status: 'active' },
    }),
    getAccount: async () => { throw new Error('not used'); },
  }, {
    allocate: async (input) => {
      allocations.push(input);
      return { accountId: input.accountId, address: 'TQ3x8uA1zC2kN6mP9rS4vW7yZ', derivationIndex: 12, id: '33333333-3333-4333-8333-333333333333', keyVersion: 3, network: input.network, ownerId: input.ownerId };
    },
  });

  const response = await router.handle(new Request('https://wallet.example/v1/me/wallet-addresses', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ network: 'tron' }),
  }), { id: 'actor-001', roles: [] });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { address: 'TQ3x8uA1zC2kN6mP9rS4vW7yZ', key_version: 3, network: 'tron' });
  assert.deepEqual(allocations, [{ accountId: '11111111-1111-4111-8111-111111111111', network: 'tron', ownerId: 'actor-001' }]);
});
