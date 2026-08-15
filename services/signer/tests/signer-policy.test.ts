import assert from 'node:assert/strict';
import test from 'node:test';

import { DomainError } from '../src/domain-errors.js';
import { InMemorySigningBackend, SignerPolicy } from '../src/signer-policy.js';

const policy = new SignerPolicy({
  allowedNetworks: ['ethereum-sepolia', 'tron-shasta'],
  mainnetEnabled: false,
  maxWithdrawalAtoms: '1000000',
  trustedCaller: 'withdrawal-worker',
}, new InMemorySigningBackend());

const request = {
  amountAtoms: '1000000',
  assetCode: 'USDT',
  caller: 'withdrawal-worker',
  derivationIndex: 7,
  destinationAddress: '0x1111111111111111111111111111111111111111',
  keyVersion: 1,
  network: 'ethereum-sepolia',
  payloadHash: 'a'.repeat(64),
  withdrawalId: 'c1b03d51-1d58-4f5c-b37f-9d94ec52ced8',
};

test('signer never exposes a private key and records an approved testnet signature', async () => {
  const result = await policy.signWithdrawal(request);
  assert.match(result.signature, /^test-signature:/);
  assert.equal(result.keyVersion, 1);
  assert.equal(policy.auditLog().length, 1);
  assert.equal(policy.auditLog()[0]?.outcome, 'signed');
  assert.doesNotMatch(JSON.stringify(result), /private|seed|mnemonic/i);
});

test('signer rejects an API caller that attempts to bypass the withdrawal worker', async () => {
  await assert.rejects(
    () => policy.signWithdrawal({ ...request, caller: 'ledger-api' }),
    (error: unknown) => error instanceof DomainError && error.code === 'signer_caller_forbidden',
  );
});

test('signer rejects wrong chain, oversized amount, malformed destination, and mainnet before it signs', async () => {
  await assert.rejects(
    () => policy.signWithdrawal({ ...request, network: 'ethereum-mainnet' }),
    (error: unknown) => error instanceof DomainError && error.code === 'signer_network_forbidden',
  );
  await assert.rejects(
    () => policy.signWithdrawal({ ...request, amountAtoms: '1000001' }),
    (error: unknown) => error instanceof DomainError && error.code === 'signer_amount_limit_exceeded',
  );
  await assert.rejects(
    () => policy.signWithdrawal({ ...request, destinationAddress: 'not-an-address' }),
    (error: unknown) => error instanceof DomainError && error.code === 'signer_invalid_destination',
  );
  await assert.rejects(
    () => policy.signWithdrawal({ ...request, network: 'ethereum-mainnet', destinationAddress: request.destinationAddress }),
    (error: unknown) => error instanceof DomainError && error.code === 'signer_network_forbidden',
  );
});
