import assert from 'node:assert/strict';
import test from 'node:test';

import { DomainError } from '../../src/domain/errors.js';
import {
  OFFICIAL_TESTNET_DEPOSIT_NETWORKS,
  assertOfficialTestnetDepositNetwork,
  depositAddressNetworks,
} from '../../src/domain/deposit-credit-policy.js';

test('only official testnet networks may be credited', () => {
  assert.deepEqual([...OFFICIAL_TESTNET_DEPOSIT_NETWORKS].sort(), ['ethereum-sepolia', 'tron-shasta']);
  assert.doesNotThrow(() => assertOfficialTestnetDepositNetwork('ethereum-sepolia'));
  assert.doesNotThrow(() => assertOfficialTestnetDepositNetwork('tron-shasta'));
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

test('wallet address aliases keep already-allocated ethereum/tron addresses visible to the testnet scanner', () => {
  assert.deepEqual(depositAddressNetworks('ethereum-sepolia'), ['ethereum-sepolia', 'ethereum']);
  assert.deepEqual(depositAddressNetworks('tron-shasta'), ['tron-shasta', 'tron']);
  assert.throws(
    () => depositAddressNetworks('ethereum-mainnet'),
    (error: unknown) => error instanceof DomainError && error.code === 'deposit_mainnet_disabled',
  );
});
