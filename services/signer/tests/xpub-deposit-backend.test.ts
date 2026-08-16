import assert from 'node:assert/strict';
import test from 'node:test';

import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';

import { DomainError } from '../src/domain-errors.js';
import { XpubDepositBackend } from '../src/xpub-deposit-backend.js';

const fixtureMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const fixtureSeed = mnemonicToSeedSync(fixtureMnemonic);
const fixtureMaster = HDKey.fromMasterSeed(fixtureSeed);
const ethAccountXpub = fixtureMaster.derive("m/44'/60'/0'").publicExtendedKey;
const tronAccountXpub = fixtureMaster.derive("m/44'/195'/0'").publicExtendedKey;
const btcAccountXpub = fixtureMaster.derive("m/84'/0'/0'").publicExtendedKey;
const xrpAccountXpub = fixtureMaster.derive("m/44'/144'/0'").publicExtendedKey;

function backend() {
  return new XpubDepositBackend({
    bitcoin: btcAccountXpub,
    ethereum: ethAccountXpub,
    tron: tronAccountXpub,
    xrp: xrpAccountXpub,
  });
}

test('derives ethereum and tron deposit addresses from account xpubs only', async () => {
  const derived = backend();

  const ethereum = await derived.deriveDepositAddress({ derivationIndex: 0, keyVersion: 1, network: 'ethereum' });
  const tron = await derived.deriveDepositAddress({ derivationIndex: 0, keyVersion: 1, network: 'tron' });

  assert.equal(ethereum, '0x9858effd232b4033e47d90003d41ec34ecaeda94');
  assert.equal(tron, 'TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH');
  assert.equal(await derived.deriveDepositAddress({ derivationIndex: 0, keyVersion: 1, network: 'ethereum-sepolia' }), ethereum);
  assert.equal(await derived.deriveDepositAddress({ derivationIndex: 0, keyVersion: 1, network: 'tron-shasta' }), tron);
  assert.notEqual(await derived.deriveDepositAddress({ derivationIndex: 1, keyVersion: 1, network: 'ethereum' }), ethereum);
  assert.doesNotMatch(JSON.stringify({ ethereum, tron }), /abandon|mnemonic|seed|xprv|private/i);
});

test('reuses the Ethereum xpub for every V1 EVM testnet', async () => {
  const derived = backend();
  const ethereum = await derived.deriveDepositAddress({ derivationIndex: 0, keyVersion: 1, network: 'ethereum-sepolia' });
  for (const network of ['bnb-testnet', 'polygon-amoy', 'arbitrum-sepolia', 'optimism-sepolia', 'base-sepolia', 'avalanche-fuji', 'linea-sepolia', 'scroll-sepolia']) {
    assert.equal(await derived.deriveDepositAddress({ derivationIndex: 0, keyVersion: 1, network }), ethereum);
  }
});

test('derives Bitcoin testnet4 and XRPL classic addresses from account xpubs only', async () => {
  const derived = backend();
  const bitcoin = await derived.deriveDepositAddress({ derivationIndex: 0, keyVersion: 1, network: 'bitcoin-testnet4' });
  const xrp = await derived.deriveDepositAddress({ derivationIndex: 0, keyVersion: 1, network: 'xrpl-testnet' });
  assert.equal(bitcoin, 'tb1qcr8te4kr609gcawutmrza0j4xv80jy8zmfp6l0');
  assert.equal(xrp, 'rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v3');
  assert.equal(await derived.deriveDepositAddress({ derivationIndex: 0, keyVersion: 1, network: 'bitcoin' }), bitcoin);
  assert.equal(await derived.deriveDepositAddress({ derivationIndex: 0, keyVersion: 1, network: 'xrp' }), xrp);
  assert.notEqual(await derived.deriveDepositAddress({ derivationIndex: 1, keyVersion: 1, network: 'xrpl-testnet' }), xrp);
  assert.doesNotMatch(JSON.stringify({ bitcoin, xrp }), /abandon|mnemonic|seed|xprv|private/i);
});

test('refuses to construct or derive from private key material', () => {
  assert.throws(
    () => new XpubDepositBackend({
      bitcoin: btcAccountXpub,
      ethereum: fixtureMaster.derive("m/44'/60'/0'").privateExtendedKey!,
      tron: tronAccountXpub,
      xrp: xrpAccountXpub,
    }),
    (error: unknown) => error instanceof DomainError && error.code === 'signer_xpub_required',
  );
  assert.doesNotMatch(ethAccountXpub, /xprv|mnemonic|seed/i);
});
