import assert from 'node:assert/strict';
import test from 'node:test';

import { OpenBaoP2PPaymentCryptographer } from '../../src/integrations/openbao-p2p-payment-cryptographer.js';

test('OpenBao payment cryptographer sends account data only to the configured private Transit key', async () => {
  const calls: Array<{ body: string; url: string }> = [];
  const cryptographer = new OpenBaoP2PPaymentCryptographer({
    fetch: async (url, init) => {
      calls.push({ body: String(init?.body), url: String(url) });
      return new Response(JSON.stringify({ data: { ciphertext: 'vault:v1:abc' } }), { status: 200 });
    },
    token: 'private-service-token', url: 'https://openbao.internal.example',
  });
  assert.equal(await cryptographer.encrypt('bank-account-0123456789'), 'vault:v1:abc');
  assert.deepEqual(calls, [{ body: JSON.stringify({ plaintext: Buffer.from('bank-account-0123456789').toString('base64') }), url: 'https://openbao.internal.example/v1/transit/encrypt/hidotpay-p2p-payment-data' }]);
});

test('OpenBao payment cryptographer rejects an unexpected ciphertext format', async () => {
  const cryptographer = new OpenBaoP2PPaymentCryptographer({ fetch: async () => new Response(JSON.stringify({ data: { ciphertext: 'plaintext' } }), { status: 200 }), token: 'private-service-token', url: 'https://openbao.internal.example' });
  await assert.rejects(() => cryptographer.encrypt('bank-account-0123456789'), /OpenBao payment encryption failed/);
});
