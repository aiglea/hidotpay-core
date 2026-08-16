import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { DomainError } from '../../ledger-api/src/domain/errors.js';
import { depositAddressNetworks } from '../../ledger-api/src/domain/deposit-credit-policy.js';
import { loadOfficialTestnetScannerConfig, PUBLIC_TESTNET_RPCS } from '../src/official-testnet-scanner.js';
import { bootstrapScanCursor } from '../src/bootstrap-scan-cursor.js';
import { InMemoryDepositScanStore } from '../src/scanner.js';

test('staging scanner is pinned to public official testnet RPCs and rejects mainnet', () => {
  assert.deepEqual(PUBLIC_TESTNET_RPCS['ethereum-sepolia'], [
    'https://rpc.sepolia.org',
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://1rpc.io/sepolia',
  ]);
  assert.deepEqual(PUBLIC_TESTNET_RPCS['tron-shasta'], [
    'https://api.shasta.trongrid.io',
  ]);

  const config = loadOfficialTestnetScannerConfig({
    CHAIN_OPERATOR_TOKEN: 'chain-operator-token-at-least-16',
  });
  assert.equal(config.evmNetworks[0]?.network, 'ethereum-sepolia');
  assert.equal(config.evmNetworks[0]?.chainId, 11155111);
  assert.deepEqual(config.evmNetworks[0]?.rpcUrls, PUBLIC_TESTNET_RPCS['ethereum-sepolia']);
  assert.equal(config.tronNetworks[0]?.network, 'tron-shasta');
  assert.deepEqual(config.tronNetworks[0]?.rpcUrls, PUBLIC_TESTNET_RPCS['tron-shasta']);
  assert.ok(config.tronNetworks[0]?.apiKey.length >= 16);
  assert.equal(config.ledgerBearerToken, 'chain-operator-token-at-least-16');

  assert.throws(
    () => loadOfficialTestnetScannerConfig({
      CHAIN_OPERATOR_TOKEN: 'chain-operator-token-at-least-16',
      DEPOSIT_EVM_NETWORKS: '[{"chainId":1,"firstBlock":0,"network":"ethereum-mainnet","rpcUrls":["https://rpc.sepolia.org"]}]',
    }),
    (error: unknown) => error instanceof DomainError && error.code === 'deposit_mainnet_disabled',
  );
  assert.throws(
    () => loadOfficialTestnetScannerConfig({}),
    (error: unknown) => error instanceof Error && /CHAIN_OPERATOR_TOKEN/.test((error as Error).message),
  );
});

test('scanner address catalog aliases already-allocated ethereum/tron wallets onto official testnets', () => {
  assert.deepEqual(depositAddressNetworks('ethereum-sepolia'), ['ethereum-sepolia', 'ethereum']);
  assert.deepEqual(depositAddressNetworks('tron-shasta'), ['tron-shasta', 'tron']);
});

test('first scan without a cursor anchors at the safe head and does not backfill history', async () => {
  const store = new InMemoryDepositScanStore();
  const adapter = {
    network: 'ethereum-sepolia',
    getHead: async () => 8_000_100,
    getBlockHash: async (height: number) => `0xblock${height}`,
    listTokenTransfers: async () => {
      throw new Error('bootstrap must not query historical transfers');
    },
  };
  const result = await bootstrapScanCursor({ adapter, reorgWindow: 32, store });
  assert.equal(result.bootstrapped, true);
  assert.equal(result.head, 8_000_100);
  assert.deepEqual(await store.cursor('ethereum-sepolia'), { blockHash: '0xblock8000068', height: 8_000_068 });
  const again = await bootstrapScanCursor({ adapter, reorgWindow: 32, store });
  assert.equal(again.bootstrapped, false);
});

test('deposit scanner worker is a cron Worker that credits through the ledger service binding', () => {
  const worker = readFileSync(new URL('../src/deposit-scanner-worker.ts', import.meta.url), 'utf8');
  const wrangler = readFileSync(new URL('../wrangler-deposit-scanner-staging.jsonc', import.meta.url), 'utf8');
  assert.match(worker, /scheduled/);
  assert.match(worker, /CHAIN_OPERATOR_TOKEN/);
  assert.match(worker, /NATIVE_LEDGER/);
  assert.match(worker, /bootstrapScanCursor/);
  assert.match(worker, /runConfiguredNetwork/);
  assert.doesNotMatch(worker, /PRIVATE_KEY|MNEMONIC|SEED/i);
  assert.match(wrangler, /"name": "hidotpay-deposit-scanner-staging"/);
  assert.match(wrangler, /"binding": "HYPERDRIVE"/);
  assert.match(wrangler, /"binding": "NATIVE_LEDGER"/);
  assert.match(wrangler, /hidotpay-native-ledger-staging/);
  assert.match(wrangler, /crons/);
  assert.doesNotMatch(wrangler, /WITHDRAWALS_ENABLED": "true"/);
});
