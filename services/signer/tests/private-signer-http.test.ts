import assert from 'node:assert/strict';
import test from 'node:test';

import { DepositAddressService, type DepositAddressBackend } from '../src/deposit-address-service.js';
import { PrivateSignerHttpHandler } from '../src/private-signer-http.js';
import { InMemorySigningBackend, SignerPolicy } from '../src/signer-policy.js';

const token = 'private-signer-test-token-0123456789';

function createHandler(options: { addressBackend?: DepositAddressBackend } = {}) {
  const addressService = new DepositAddressService({
    allowedNetworks: ['ethereum-sepolia'],
    mainnetEnabled: false,
    trustedCaller: 'wallet-address-service',
  }, options.addressBackend ?? { async deriveDepositAddress() { return '0x1111111111111111111111111111111111111111'; } });
  const signingPolicy = new SignerPolicy({
    allowedNetworks: ['ethereum-sepolia'],
    mainnetEnabled: false,
    maxWithdrawalAtoms: '1000000',
    trustedCaller: 'withdrawal-worker',
  }, new InMemorySigningBackend());
  return { addressService, handler: new PrivateSignerHttpHandler({ addressService, serviceToken: token, signingPolicy }) };
}

test('private signer only derives addresses with its own trusted service identity', async () => {
  const { addressService, handler } = createHandler();

  const response = await handler.handle({
    authorization: `Bearer ${token}`,
    body: JSON.stringify({ derivation_index: 7, key_version: 1, network: 'ethereum-sepolia' }),
    method: 'POST',
    path: '/v1/deposit-addresses',
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    address: '0x1111111111111111111111111111111111111111',
    key_version: 1,
    network: 'ethereum-sepolia',
  });
  assert.equal(addressService.auditLog()[0]?.outcome, 'derived');
});

test('private signer rejects unauthenticated and malformed requests before address derivation or signing', async () => {
  let deriveCalls = 0;
  const { addressService, handler } = createHandler({
    addressBackend: { async deriveDepositAddress() { deriveCalls += 1; return '0x1111111111111111111111111111111111111111'; } },
  });

  const unauthenticated = await handler.handle({
    authorization: undefined,
    body: JSON.stringify({ derivation_index: 7, key_version: 1, network: 'ethereum-sepolia' }),
    method: 'POST',
    path: '/v1/deposit-addresses',
  });
  assert.equal(unauthenticated.statusCode, 401);

  const malformed = await handler.handle({
    authorization: `Bearer ${token}`,
    body: JSON.stringify({ derivation_index: -1, key_version: 1, network: 'ethereum-sepolia' }),
    method: 'POST',
    path: '/v1/deposit-addresses',
  });
  assert.equal(malformed.statusCode, 400);
  assert.equal(deriveCalls, 0);
  assert.equal(addressService.auditLog()[0]?.outcome, 'rejected');
});

test('private signer rejects secret-like fields instead of accepting arbitrary signing input', async () => {
  const { handler } = createHandler();
  const response = await handler.handle({
    authorization: `Bearer ${token}`,
    body: JSON.stringify({
      amount_atoms: '1',
      asset_code: 'USDT',
      derivation_index: 7,
      destination_address: '0x1111111111111111111111111111111111111111',
      key_version: 1,
      network: 'ethereum-sepolia',
      payload_hash: 'a'.repeat(64),
      private_key: 'must-never-be-accepted',
      withdrawal_id: 'c1b03d51-1d58-4f5c-b37f-9d94ec52ced8',
    }),
    method: 'POST',
    path: '/v1/withdrawals/sign',
  });

  assert.equal(response.statusCode, 400);
  assert.doesNotMatch(response.body, /private|seed|mnemonic/i);
});

test('private signer accepts only the approved structured withdrawal fields', async () => {
  const { handler } = createHandler();
  const response = await handler.handle({
    authorization: `Bearer ${token}`,
    body: JSON.stringify({
      amount_atoms: '1', asset_code: 'USDT', derivation_index: 7,
      destination_address: '0x1111111111111111111111111111111111111111', key_version: 1,
      network: 'ethereum-sepolia', payload_hash: 'a'.repeat(64),
      withdrawal_id: 'c1b03d51-1d58-4f5c-b37f-9d94ec52ced8',
    }),
    method: 'POST', path: '/v1/withdrawals/sign',
  });
  assert.equal(response.statusCode, 200);
  assert.match(JSON.parse(response.body).signature, /^test-signature:/);
});
