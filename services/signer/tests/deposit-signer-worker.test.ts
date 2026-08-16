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
    BTC_ACCOUNT_XPUB: fixtureMaster.derive("m/84'/0'/0'").publicExtendedKey,
    ETH_ACCOUNT_XPUB: fixtureMaster.derive("m/44'/60'/0'").publicExtendedKey,
    SIGNER_SERVICE_TOKEN: token,
    SOL_ADDRESS_TABLE: JSON.stringify(['So11111111111111111111111111111111111111112']),
    TON_ADDRESS_TABLE: JSON.stringify(['kQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH_0']),
    TRON_ACCOUNT_XPUB: fixtureMaster.derive("m/44'/195'/0'").publicExtendedKey,
    XLM_ADDRESS_TABLE: JSON.stringify(['GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF']),
    XRP_ACCOUNT_XPUB: fixtureMaster.derive("m/44'/144'/0'").publicExtendedKey,
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

test('worker derives Bitcoin, XRP and V1 EVM public addresses', async () => {
  const bitcoin = await worker().fetch(new Request('https://signer.example/v1/deposit-addresses', {
    body: JSON.stringify({ derivation_index: 0, key_version: 1, network: 'bitcoin-testnet4' }),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    method: 'POST',
  }));
  const polygon = await worker().fetch(new Request('https://signer.example/v1/deposit-addresses', {
    body: JSON.stringify({ derivation_index: 0, key_version: 1, network: 'polygon-amoy' }),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    method: 'POST',
  }));
  assert.equal(bitcoin.status, 200);
  assert.equal(((await bitcoin.json()) as { address: string }).address, 'tb1qcr8te4kr609gcawutmrza0j4xv80jy8zmfp6l0');
  assert.equal(polygon.status, 200);
  assert.equal(((await polygon.json()) as { address: string }).address, '0x9858effd232b4033e47d90003d41ec34ecaeda94');
});

test('worker rejects callers without the service token', async () => {
  const response = await worker().fetch(new Request('https://signer.example/v1/deposit-addresses', {
    body: JSON.stringify({ derivation_index: 0, key_version: 1, network: 'ethereum' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  }));
  assert.equal(response.status, 401);
});
