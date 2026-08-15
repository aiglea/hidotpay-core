import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../../src/http/app.js';
import { InMemoryLedgerRepository } from '../../src/repositories/in-memory-ledger-repository.js';
import { fixedWithdrawalFeePolicy } from '../../src/services/funding-service.js';

test('the public API does not expose prototype custody, fixture credits, or browser-supplied user identities', async (t) => {
  const app = buildApp({ environment: 'test', repository: new InMemoryLedgerRepository(), withdrawalFeePolicy: fixedWithdrawalFeePolicy({}) });
  t.after(() => app.close());

  for (const url of ['/ui', '/ui/balance', '/v1/addresses', '/v1/fixtures/deposit', '/v1/balances/spoofed-user']) {
    const response = await app.inject({ method: url === '/ui/balance' || url.startsWith('/v1/balances') ? 'GET' : 'POST', url, headers: { 'x-actor-id': 'spoofed-user' } });
    assert.equal(response.statusCode, 404, url);
  }
});

test('public health endpoint carries no custody data', async (t) => {
  const app = buildApp({ environment: 'test', repository: new InMemoryLedgerRepository(), withdrawalFeePolicy: fixedWithdrawalFeePolicy({}) });
  t.after(() => app.close());
  const response = await app.inject({ method: 'GET', url: '/healthz' });
  assert.deepEqual(response.json(), { status: 'ok', ok: true, service: 'hidotpay-ledger-api' });
});
