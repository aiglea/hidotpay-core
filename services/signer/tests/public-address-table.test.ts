import assert from 'node:assert/strict';
import test from 'node:test';

import { DomainError } from '../src/domain-errors.js';
import { loadPublicAddressTable, PublicAddressTableBackend } from '../src/public-address-table.js';

const tables = {
  solana: ['SoL1111111111111111111111111111111111111112', 'SoL2222222222222222222222222222222222222223'],
  stellar: ['GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'],
  ton: ['kQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH_0', '0QBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'],
};

test('looks up precomputed public addresses by derivation index', async () => {
  const backend = new PublicAddressTableBackend(tables);
  assert.equal(await backend.deriveDepositAddress({ derivationIndex: 0, keyVersion: 1, network: 'solana-devnet' }), tables.solana[0]);
  assert.equal(await backend.deriveDepositAddress({ derivationIndex: 1, keyVersion: 1, network: 'solana' }), tables.solana[1]);
  assert.equal(await backend.deriveDepositAddress({ derivationIndex: 0, keyVersion: 1, network: 'ton-testnet' }), tables.ton[0]);
  assert.equal(await backend.deriveDepositAddress({ derivationIndex: 0, keyVersion: 1, network: 'stellar-testnet' }), tables.stellar[0]);
});

test('loads a single Worker secret or concatenates numbered chunks under the Cloudflare size limit', () => {
  assert.deepEqual(
    loadPublicAddressTable({ SOL_ADDRESS_TABLE: JSON.stringify(tables.solana) }, 'SOL_ADDRESS_TABLE'),
    [...tables.solana],
  );
  assert.deepEqual(
    loadPublicAddressTable({
      SOL_ADDRESS_TABLE_0: JSON.stringify([tables.solana[0]]),
      SOL_ADDRESS_TABLE_1: JSON.stringify([tables.solana[1]]),
    }, 'SOL_ADDRESS_TABLE'),
    [...tables.solana],
  );
});

test('fails closed when the index is outside the public address table', async () => {
  const backend = new PublicAddressTableBackend(tables);
  await assert.rejects(
    () => backend.deriveDepositAddress({ derivationIndex: 99, keyVersion: 1, network: 'solana-devnet' }),
    (error: unknown) => error instanceof DomainError && error.code === 'signer_backend_failed',
  );
});
