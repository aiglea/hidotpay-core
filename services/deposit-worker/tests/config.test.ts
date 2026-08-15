import assert from 'node:assert/strict';
import test from 'node:test';

import { loadDepositWorkerConfig } from '../src/config.js';

test('deposit worker requires a private ledger identity and configured EVM failover endpoints', () => {
  assert.deepEqual(loadDepositWorkerConfig({
    DATABASE_URL: 'postgresql://deposit:secret@cockroach.internal:26257/hidotpay?sslmode=verify-full',
    DEPOSIT_EVM_NETWORKS: '[{"chainId":11155111,"firstBlock":100,"network":"ethereum-sepolia","rpcUrls":["https://rpc-a.internal","https://rpc-b.internal"]}]',
    DEPOSIT_LEDGER_BEARER_TOKEN: 'chain-worker-token-at-least-16-chars',
    DEPOSIT_LEDGER_URL: 'https://ledger.internal',
  }), {
    databaseUrl: 'postgresql://deposit:secret@cockroach.internal:26257/hidotpay?sslmode=verify-full',
    evmNetworks: [{ chainId: 11155111, firstBlock: 100, network: 'ethereum-sepolia', rpcUrls: ['https://rpc-a.internal/', 'https://rpc-b.internal/'] }],
    ledgerBearerToken: 'chain-worker-token-at-least-16-chars',
    ledgerUrl: 'https://ledger.internal/',
    maxBlockRange: 1000,
    pollIntervalMs: 1000,
    reorgWindow: 32,
    tronNetworks: [],
  });
  assert.throws(() => loadDepositWorkerConfig({
    DATABASE_URL: 'postgresql://deposit:secret@cockroach.internal:26257/hidotpay', DEPOSIT_EVM_NETWORKS: '[]', DEPOSIT_LEDGER_BEARER_TOKEN: 'short', DEPOSIT_LEDGER_URL: 'http://ledger.internal',
  }), /DEPOSIT_LEDGER_URL must be private HTTPS/);
  assert.throws(() => loadDepositWorkerConfig({
    DATABASE_URL: 'postgresql://deposit:secret@cockroach.internal:26257/hidotpay', DEPOSIT_EVM_NETWORKS: '[{"chainId":1,"firstBlock":0,"network":"ethereum","rpcUrls":["http://rpc.internal"]}]', DEPOSIT_LEDGER_BEARER_TOKEN: 'chain-worker-token-at-least-16-chars', DEPOSIT_LEDGER_URL: 'https://ledger.internal',
  }), /DEPOSIT_EVM_NETWORKS RPC URL must be private HTTPS/);
});
