import assert from 'node:assert/strict';
import test from 'node:test';

import { createLedgerTokenReader, isInvalidAuthGrant } from '../src/auth-session.ts';

test('detects Logto invalid_grant so a dead refresh token is not retried', () => {
  assert.equal(isInvalidAuthGrant({ code: 'oidc.invalid_grant', message: '授權請求無效', error: 'invalid_grant' }), true);
  assert.equal(isInvalidAuthGrant(Object.assign(new Error('授權請求無效'), { name: 'LogtoRequestError', code: 'oidc.invalid_grant' })), true);
  assert.equal(isInvalidAuthGrant(new Error('未能讀取錢包資料，請稍後再試。')), false);
});

test('ledger token reader shares one in-flight refresh instead of racing two callers', async () => {
  let calls = 0;
  const reader = createLedgerTokenReader(async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return `token-${calls}`;
  }, 'https://api-dev.hidotpay.com');

  const [first, second] = await Promise.all([reader(), reader()]);
  assert.equal(first, 'token-1');
  assert.equal(second, 'token-1');
  assert.equal(calls, 1);
});
