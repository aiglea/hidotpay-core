import assert from 'node:assert/strict';
import test from 'node:test';

import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';

import { createDepositSignerWorker } from '../src/deposit-signer-worker.js';

const fixtureSeed = mnemonicToSeedSync('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
const fixtureMaster = HDKey.fromMasterSeed(fixtureSeed);
const token = 'private-signer-test-token-0123456789';

function worker() {
  return createDepositSignerWorker({
    ETH_ACCOUNT_XPUB: fixtureMaster.derive("m/44'/60'/0'").publicExtendedKey,
    SIGNER_SERVICE_TOKEN: token,
    TRON_ACCOUNT_XPUB: fixtureMaster.derive("m/44'/195'/0'").publicExtendedKey,
  });
}

test('worker derives a public ethereum address and refuses withdrawal signing', async () => {
  const response = await worker().fetch(new Request('https://signer.example/v1/deposit-addresses', {
    body: JSON.stringify({ derivation_index: 0, key_version: 1, network: 'ethereum' }),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    method: 'POST',
  }));
  const body = await response.json() as { address: string; network: string };

  assert.equal(response.status, 200);
  assert.equal(body.address, '0x9858effd232b4033e47d90003d41ec34ecaeda94');
  assert.equal(body.network, 'ethereum');

  const withdrawal = await worker().fetch(new Request('https://signer.example/v1/withdrawals/sign', {
    body: JSON.stringify({
      amount_atoms: '1',
      asset_code: 'USDT',
      derivation_index: 0,
      destination_address: '0x1111111111111111111111111111111111111111',
      key_version: 1,
      network: 'ethereum',
      payload_hash: 'a'.repeat(64),
      withdrawal_id: '11111111-1111-4111-8111-111111111111',
    }),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    method: 'POST',
  }));
  assert.equal(withdrawal.status, 400);
});

test('worker rejects callers without the service token', async () => {
  const response = await worker().fetch(new Request('https://signer.example/v1/deposit-addresses', {
    body: JSON.stringify({ derivation_index: 0, key_version: 1, network: 'ethereum' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  }));
  assert.equal(response.status, 401);
});
