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

test('derives ethereum and tron deposit addresses from account xpubs only', async () => {
  const backend = new XpubDepositBackend({ ethereum: ethAccountXpub, tron: tronAccountXpub });

  const ethereum = await backend.deriveDepositAddress({ derivationIndex: 0, keyVersion: 1, network: 'ethereum' });
  const tron = await backend.deriveDepositAddress({ derivationIndex: 0, keyVersion: 1, network: 'tron' });

  assert.equal(ethereum, '0x9858effd232b4033e47d90003d41ec34ecaeda94');
  assert.equal(tron, 'TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH');
  assert.equal(await backend.deriveDepositAddress({ derivationIndex: 0, keyVersion: 1, network: 'ethereum-sepolia' }), ethereum);
  assert.equal(await backend.deriveDepositAddress({ derivationIndex: 0, keyVersion: 1, network: 'tron-shasta' }), tron);
  assert.notEqual(await backend.deriveDepositAddress({ derivationIndex: 1, keyVersion: 1, network: 'ethereum' }), ethereum);
  assert.doesNotMatch(JSON.stringify({ ethereum, tron }), /abandon|mnemonic|seed|xprv|private/i);
});

test('refuses to construct or derive from private key material', () => {
  assert.throws(
    () => new XpubDepositBackend({ ethereum: fixtureMaster.derive("m/44'/60'/0'").privateExtendedKey!, tron: tronAccountXpub }),
    (error: unknown) => error instanceof DomainError && error.code === 'signer_xpub_required',
  );
  assert.doesNotMatch(ethAccountXpub, /xprv|mnemonic|seed/i);
});
