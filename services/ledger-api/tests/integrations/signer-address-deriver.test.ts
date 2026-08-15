import assert from 'node:assert/strict';
import test from 'node:test';

import { RemoteSignerAddressDeriver } from '../../src/integrations/signer-address-deriver.js';

test('ledger API requests a public deposit address through the private signer without sending key material', async () => {
  const requests: Array<{ body: unknown; headers: Headers; url: string }> = [];
  const deriver = new RemoteSignerAddressDeriver({
    fetchImpl: async (url, init) => {
      requests.push({ body: init?.body, headers: new Headers(init?.headers), url: String(url) });
      return new Response(JSON.stringify({ address: '0x1111111111111111111111111111111111111111' }), { status: 200 });
    },
    serviceToken: 'test-signer-service-token',
    url: 'https://signer.internal.example/v1/deposit-addresses',
  });

  assert.equal(await deriver.deriveDepositAddress({ derivationIndex: 7, keyVersion: 2, network: 'ethereum-sepolia' }), '0x1111111111111111111111111111111111111111');
  assert.deepEqual(requests.map((request) => ({
    authorization: request.headers.get('authorization'),
    body: request.body,
    url: request.url,
  })), [{
    authorization: 'Bearer test-signer-service-token',
    body: JSON.stringify({ derivation_index: 7, key_version: 2, network: 'ethereum-sepolia' }),
    url: 'https://signer.internal.example/v1/deposit-addresses',
  }]);
  assert.doesNotMatch(String(requests[0]?.body), /private|mnemonic|seed|key_material/i);
});

test('ledger API refuses malformed or unsuccessful private signer responses', async () => {
  const badResponse = new RemoteSignerAddressDeriver({
    fetchImpl: async () => new Response(JSON.stringify({ private_key: 'never accept this' }), { status: 200 }),
    serviceToken: 'test-signer-service-token',
    url: 'https://signer.internal.example/v1/deposit-addresses',
  });
  const unavailable = new RemoteSignerAddressDeriver({
    fetchImpl: async () => new Response('', { status: 503 }),
    serviceToken: 'test-signer-service-token',
    url: 'https://signer.internal.example/v1/deposit-addresses',
  });

  await assert.rejects(() => badResponse.deriveDepositAddress({ derivationIndex: 0, keyVersion: 1, network: 'tron-shasta' }), /signer response is invalid/);
  await assert.rejects(() => unavailable.deriveDepositAddress({ derivationIndex: 0, keyVersion: 1, network: 'tron-shasta' }), /private signer returned HTTP 503/);
});
