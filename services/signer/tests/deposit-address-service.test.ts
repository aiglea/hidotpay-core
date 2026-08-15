import assert from 'node:assert/strict';
import test from 'node:test';

import { DomainError } from '../src/domain-errors.js';
import { DepositAddressService, type DepositAddressBackend } from '../src/deposit-address-service.js';

const request = {
  caller: 'wallet-address-service',
  derivationIndex: 7,
  keyVersion: 1,
  network: 'ethereum-sepolia',
};

test('derives a public deposit address without exposing key material', async () => {
  const backend: DepositAddressBackend = {
    async deriveDepositAddress() {
      return '0x1111111111111111111111111111111111111111';
    },
  };
  const service = new DepositAddressService({
    allowedNetworks: ['ethereum-sepolia', 'tron-shasta'],
    mainnetEnabled: false,
    trustedCaller: 'wallet-address-service',
  }, backend);

  const result = await service.deriveDepositAddress(request);

  assert.deepEqual(result, {
    address: '0x1111111111111111111111111111111111111111',
    keyVersion: 1,
    network: 'ethereum-sepolia',
  });
  assert.doesNotMatch(JSON.stringify(result), /private|seed|mnemonic/i);
});

test('rejects non-private callers, mainnet, and an address returned for the wrong chain', async () => {
  const backend: DepositAddressBackend = {
    async deriveDepositAddress() {
      return 'TQXy7f75pxPnYt5M8Wj5tNGekfFuVyDyQj';
    },
  };
  const service = new DepositAddressService({
    allowedNetworks: ['ethereum-sepolia', 'ethereum-mainnet'],
    mainnetEnabled: false,
    trustedCaller: 'wallet-address-service',
  }, backend);

  await assert.rejects(
    () => service.deriveDepositAddress({ ...request, caller: 'ledger-api' }),
    (error: unknown) => error instanceof DomainError && error.code === 'signer_caller_forbidden',
  );
  await assert.rejects(
    () => service.deriveDepositAddress({ ...request, network: 'ethereum-mainnet' }),
    (error: unknown) => error instanceof DomainError && error.code === 'signer_mainnet_disabled',
  );
  await assert.rejects(
    () => service.deriveDepositAddress(request),
    (error: unknown) => error instanceof DomainError && error.code === 'signer_invalid_derived_address',
  );
});
