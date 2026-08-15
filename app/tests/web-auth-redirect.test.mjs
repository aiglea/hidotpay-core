import assert from 'node:assert/strict';
import test from 'node:test';

test('web authentication callbacks use the deployed HTTPS origin', async () => {
  const { webAuthRedirectUris } = await import('../src/web-auth-redirect.ts');

  assert.deepEqual(webAuthRedirectUris('https://hidotpay-wallet-ui.lgninhk.workers.dev'), {
    postLogoutRedirectUri: 'https://hidotpay-wallet-ui.lgninhk.workers.dev',
    redirectUri: 'https://hidotpay-wallet-ui.lgninhk.workers.dev/callback',
  });
});

test('web authentication only permits HTTP for explicit local development origins', async () => {
  const { webAuthRedirectUris } = await import('../src/web-auth-redirect.ts');

  assert.equal(webAuthRedirectUris('http://localhost:3000').redirectUri, 'http://localhost:3000/callback');
  assert.equal(webAuthRedirectUris('http://127.0.0.1:3000').redirectUri, 'http://127.0.0.1:3000/callback');
  assert.equal(webAuthRedirectUris('http://wallet.example.test').redirectUri, 'http://localhost:3000/callback');
  assert.equal(webAuthRedirectUris('not-a-url').redirectUri, 'http://localhost:3000/callback');
});
