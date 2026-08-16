import assert from 'node:assert/strict';
import test from 'node:test';

import { DomainError } from '../../src/domain/errors.js';
import {
  OFFICIAL_TESTNET_DEPOSIT_NETWORKS,
  assertOfficialTestnetDepositNetwork,
  depositAddressNetworks,
} from '../../src/domain/deposit-credit-policy.js';

test('only official V1 testnet networks may be credited', () => {
  assert.deepEqual([...OFFICIAL_TESTNET_DEPOSIT_NETWORKS].sort(), [
    'arbitrum-sepolia',
    'avalanche-fuji',
    'base-sepolia',
    'bitcoin-testnet4',
    'bnb-testnet',
    'ethereum-sepolia',
    'linea-sepolia',
    'optimism-sepolia',
    'polygon-amoy',
    'scroll-sepolia',
    'solana-devnet',
    'stellar-testnet',
    'ton-testnet',
    'tron-shasta',
    'xrpl-testnet',
  ]);
  assert.doesNotThrow(() => assertOfficialTestnetDepositNetwork('ethereum-sepolia'));
  assert.doesNotThrow(() => assertOfficialTestnetDepositNetwork('tron-shasta'));
  assert.doesNotThrow(() => assertOfficialTestnetDepositNetwork('bitcoin-testnet4'));
  assert.doesNotThrow(() => assertOfficialTestnetDepositNetwork('solana-devnet'));
});

test('mainnet and unofficial networks are rejected before any ledger write', () => {
  for (const network of ['ethereum-mainnet', 'tron-mainnet', 'ethereum', 'tron', 'bitcoin', 'sepolia']) {
    assert.throws(
      () => assertOfficialTestnetDepositNetwork(network),
      (error: unknown) => error instanceof DomainError && (error.code === 'deposit_mainnet_disabled' || error.code === 'invalid_network'),
    );
  }
  assert.throws(
    () => assertOfficialTestnetDepositNetwork('ethereum-mainnet'),
    (error: unknown) => error instanceof DomainError && error.code === 'deposit_mainnet_disabled',
  );
});

test('wallet address aliases keep already-allocated product names visible to the testnet scanner', () => {
  assert.deepEqual(depositAddressNetworks('ethereum-sepolia'), ['ethereum-sepolia', 'ethereum']);
  assert.deepEqual(depositAddressNetworks('tron-shasta'), ['tron-shasta', 'tron']);
  assert.deepEqual(depositAddressNetworks('bitcoin-testnet4'), ['bitcoin-testnet4', 'bitcoin']);
  assert.deepEqual(depositAddressNetworks('solana-devnet'), ['solana-devnet', 'solana']);
  assert.throws(
    () => depositAddressNetworks('ethereum-mainnet'),
    (error: unknown) => error instanceof DomainError && error.code === 'deposit_mainnet_disabled',
  );
});
