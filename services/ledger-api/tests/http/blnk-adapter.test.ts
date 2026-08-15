import assert from 'node:assert/strict';
import test from 'node:test';

import { BlnkLedgerClient, createFetchBlnk } from '../../src/integrations/blnk-ledger.js';

test('formal Blnk client sends atom strings with the Cockroach ledger id as its idempotency reference', async () => {
  const calls: Array<{ body?: unknown; method: string; path: string }> = [];
  const ledger = new BlnkLedgerClient({
    async request(method, path, body) {
      calls.push({ body, method, path });
      if (method === 'POST' && path === '/transactions') {
        return { id: 'txn_blnk_123', status: 'APPLIED' };
      }
      throw new Error(`unexpected ${method} ${path}`);
    },
  });

  const result = await ledger.recordDepositCredit({
    amountAtoms: '1000001',
    assetCode: 'USDT',
    destinationAccountId: '2a770994-f0d7-4e5f-a7b8-51509d2e3f7a',
    ledgerTransactionId: '1f865b2d-3ad6-4cb9-848e-4b5a59459a3f',
    precision: '1000000',
  });

  assert.deepEqual(result, { blnkTransactionId: 'txn_blnk_123', status: 'APPLIED' });
  assert.deepEqual(calls, [{
    body: {
      allow_overdraft: true,
      currency: 'USDT',
      description: 'HiDot Pay confirmed chain deposit',
      destination: '@hidotpay:account:2a770994-f0d7-4e5f-a7b8-51509d2e3f7a',
      meta_data: { hidotpay_ledger_transaction_id: '1f865b2d-3ad6-4cb9-848e-4b5a59459a3f', transaction_type: 'deposit_credit' },
      precise_amount: '1000001',
      precision: '1000000',
      reference: 'hidotpay:ledger:1f865b2d-3ad6-4cb9-848e-4b5a59459a3f',
      skip_queue: false,
      source: '@hidotpay:platform:settlement',
    },
    method: 'POST',
    path: '/transactions',
  }]);
});

test('Blnk HTTP transport preserves an atom amount beyond JavaScript safe integer precision', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = '';
  globalThis.fetch = async (_input, init) => {
    requestBody = String(init?.body ?? '');
    return new Response('{"id":"txn_blnk_456","status":"APPLIED"}', { status: 200 });
  };
  try {
    const http = createFetchBlnk('http://127.0.0.1:5001', 'test-key');
    await http.request('POST', '/transactions', {
      precise_amount: '9007199254740993',
      precision: '1000000',
      reference: 'hidotpay:ledger:1f865b2d-3ad6-4cb9-848e-4b5a59459a3f',
    });
    assert.match(requestBody, /"precise_amount":9007199254740993/);
    assert.doesNotMatch(requestBody, /"precise_amount":"9007199254740993"/);
    assert.match(requestBody, /"precision":1000000/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Blnk client resolves an interrupted retry from the immutable reference before creating another transaction', async () => {
  const calls: string[] = [];
  const ledger = new BlnkLedgerClient({
    async request(method, path) {
      calls.push(`${method} ${path}`);
      if (method === 'POST') throw new Error('Blnk POST /transactions returned HTTP 409');
      if (method === 'GET' && path === '/transactions/reference/hidotpay%3Aledger%3A1f865b2d-3ad6-4cb9-848e-4b5a59459a3f') {
        return { status: 'APPLIED', transaction_id: 'txn_blnk_existing' };
      }
      throw new Error(`unexpected ${method} ${path}`);
    },
  });

  const result = await ledger.recordDepositCredit({
    amountAtoms: '1000001',
    assetCode: 'USDT',
    destinationAccountId: '2a770994-f0d7-4e5f-a7b8-51509d2e3f7a',
    ledgerTransactionId: '1f865b2d-3ad6-4cb9-848e-4b5a59459a3f',
    precision: 1_000_000,
  });

  assert.deepEqual(result, { blnkTransactionId: 'txn_blnk_existing', status: 'APPLIED' });
  assert.deepEqual(calls, [
    'POST /transactions',
    'GET /transactions/reference/hidotpay%3Aledger%3A1f865b2d-3ad6-4cb9-848e-4b5a59459a3f',
  ]);
});

test('Blnk client follows the queued reference suffix to its final applied transaction', async () => {
  const reference = 'hidotpay:ledger:1f865b2d-3ad6-4cb9-848e-4b5a59459a3f';
  const calls: string[] = [];
  const ledger = new BlnkLedgerClient({
    async request(method, path) {
      calls.push(`${method} ${path}`);
      if (path === `/transactions/reference/${encodeURIComponent(reference)}`) return { status: 'QUEUED', transaction_id: 'txn_blnk_queued' };
      if (path === `/transactions/reference/${encodeURIComponent(`${reference}_q`)}`) return { status: 'APPLIED', transaction_id: 'txn_blnk_applied' };
      throw new Error(`unexpected ${method} ${path}`);
    },
  });

  assert.deepEqual(await ledger.findTransactionByReference(reference), { blnkTransactionId: 'txn_blnk_applied', status: 'APPLIED' });
  assert.deepEqual(calls, [
    `GET /transactions/reference/${encodeURIComponent(reference)}`,
    `GET /transactions/reference/${encodeURIComponent(`${reference}_q`)}`,
  ]);
});
