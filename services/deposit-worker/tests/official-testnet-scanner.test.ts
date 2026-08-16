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
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://1rpc.io/sepolia',
    'https://gateway.tenderly.co/public/sepolia',
  ]);
  assert.doesNotMatch(PUBLIC_TESTNET_RPCS['ethereum-sepolia'].join(' '), /rpc\.sepolia\.org/);
  assert.deepEqual(PUBLIC_TESTNET_RPCS['tron-shasta'], [
    'https://api.shasta.trongrid.io',
  ]);

  const config = loadOfficialTestnetScannerConfig({
    CHAIN_OPERATOR_TOKEN: 'chain-operator-token-at-least-16',
  });
  const sepolia = config.evmNetworks.find((network) => network.network === 'ethereum-sepolia');
  assert.equal(sepolia?.chainId, 11155111);
  assert.deepEqual(sepolia?.rpcUrls, PUBLIC_TESTNET_RPCS['ethereum-sepolia']);
  assert.ok(config.evmNetworks.some((network) => network.network === 'base-sepolia'));
  assert.ok(config.evmNetworks.some((network) => network.network === 'avalanche-fuji'));
  assert.ok(config.evmNetworks.some((network) => network.network === 'polygon-amoy'));
  assert.ok(config.evmNetworks.some((network) => network.network === 'arbitrum-sepolia'));
  assert.ok(config.evmNetworks.some((network) => network.network === 'optimism-sepolia'));
  assert.ok(config.evmNetworks.some((network) => network.network === 'linea-sepolia'));
  assert.equal(config.evmNetworks.some((network) => network.network === 'bnb-testnet'), false);
  assert.equal(config.evmNetworks.some((network) => network.network === 'scroll-sepolia'), false);
  assert.equal(config.tronNetworks[0]?.network, 'tron-shasta');
  assert.deepEqual(config.tronNetworks[0]?.rpcUrls, PUBLIC_TESTNET_RPCS['tron-shasta']);
  assert.ok(config.tronNetworks[0]?.apiKey.length >= 16);
  assert.deepEqual(config.bitcoinNetworks.map((network) => network.network), ['bitcoin-testnet4']);
  assert.deepEqual(config.solanaNetworks.map((network) => network.network), ['solana-devnet']);
  assert.deepEqual(config.stellarNetworks.map((network) => network.network), ['stellar-testnet']);
  assert.deepEqual(config.xrplNetworks.map((network) => network.network), ['xrpl-testnet']);
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
  const evmProvider = readFileSync(new URL('../src/evm-rpc-provider.ts', import.meta.url), 'utf8');
  const tronProvider = readFileSync(new URL('../src/tron-solidified-provider.ts', import.meta.url), 'utf8');
  assert.match(evmProvider, /boundRuntimeFetch/);
  assert.match(tronProvider, /boundRuntimeFetch/);
  assert.doesNotMatch(evmProvider, /config\.fetch \?\? fetch/);
  assert.doesNotMatch(tronProvider, /config\.fetch \?\? fetch/);
  assert.match(wrangler, /"name": "hidotpay-deposit-scanner-staging"/);
  assert.match(wrangler, /"binding": "HYPERDRIVE"/);
  assert.match(wrangler, /"binding": "NATIVE_LEDGER"/);
  assert.match(wrangler, /hidotpay-native-ledger-staging/);
  assert.match(wrangler, /crons/);
  assert.doesNotMatch(wrangler, /WITHDRAWALS_ENABLED": "true"/);
});
