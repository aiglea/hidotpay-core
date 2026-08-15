import assert from 'node:assert/strict';
import test from 'node:test';

import { NocoBaseProjectionTarget } from '../src/nocobase-target.js';

test('target sends updateOrCreate with source_id and never serializes a database URL', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const target = new NocoBaseProjectionTarget({
    baseUrl: 'http://127.0.0.1:13000',
    fetch: async (url, init) => {
      calls.push({ init: init!, url: String(url) });
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    },
    token: 'limited-token',
  });

  await target.upsert('ledger_transactions', [{
    actor_id: null,
    source_id: '7f5e4cc6-cbde-4e0b-bf5f-1fb600a6c9e1',
    source_updated_at: '2026-08-15T00:00:00.000Z',
    status: 'committed',
    transaction_type: 'internal_transfer',
  }]);

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /hidotpay_admin_ledger_transactions:updateOrCreate\?filterKeys%5B%5D=source_id$/);
  assert.equal(calls[0].init.headers && new Headers(calls[0].init.headers).get('authorization'), 'Bearer limited-token');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    actor_id: null,
    source_id: '7f5e4cc6-cbde-4e0b-bf5f-1fb600a6c9e1',
    source_updated_at: '2026-08-15T00:00:00.000Z',
    status: 'committed',
    transaction_type: 'internal_transfer',
  });
  assert.doesNotMatch(String(calls[0].init.body), /DATABASE_URL|postgres:|cockroach/i);
});
