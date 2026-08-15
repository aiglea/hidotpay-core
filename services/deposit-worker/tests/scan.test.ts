import assert from 'node:assert/strict';
import test from 'node:test';

import { DepositScanner, InMemoryDepositScanStore } from '../src/scanner.js';
import type { ChainAdapter, ChainTransfer, TransferQuery } from '../../ledger-api/src/chains/adapter.js';
import { ChainAssetPolicyRegistry } from '../../ledger-api/src/chains/policy.js';

class FixtureAdapter implements ChainAdapter {
  public readonly network = 'tron-shasta';
  public head = 10;
  public reorged = false;
  public queries: TransferQuery[] = [];

  public async getHead(): Promise<number> { return this.head; }
  public async getBlockHash(height: number): Promise<string> { return `${this.reorged ? 'reorg' : 'canonical'}-${height}`; }
  public async listTokenTransfers(query: TransferQuery): Promise<ChainTransfer[]> {
    this.queries.push(query);
    return query.fromBlock <= 8 && query.toBlock >= 8
      ? [{ amountAtoms: '1000000', blockHash: 'canonical-8', blockHeight: 8, contractIdentifier: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj', destinationAddress: 'T111111111111111111111111111111111', eventIndex: 0, network: this.network, transactionHash: 'tx-001' }]
      : [];
  }
}

const policy = new ChainAssetPolicyRegistry([{
  assetCode: 'USDT', contractIdentifier: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj', decimals: 6, depositEnabled: true, feeAssetCode: 'TRX', minimumConfirmations: 3, network: 'tron-shasta', withdrawalEnabled: true,
}]);

test('scanner persists its cursor, only emits finalized official deposits, and deduplicates restart scans', async () => {
  const adapter = new FixtureAdapter();
  const store = new InMemoryDepositScanStore();
  const scanner = new DepositScanner(adapter, store, policy, { reorgWindow: 2 });
  const target = { accountId: 'account-1', address: 'T111111111111111111111111111111111', assetCode: 'USDT' };

  const first = await scanner.scan([target], 7);
  assert.deepEqual(first, { candidates: 1, fromBlock: 7, head: 10, reorgRecovered: false });
  assert.equal(store.observations().length, 1);
  assert.equal(store.observations()[0]?.status, 'finalized_candidate');
  assert.equal((await store.cursor('tron-shasta'))?.height, 10);

  const afterRestart = await scanner.scan([target], 7);
  assert.deepEqual(afterRestart, { candidates: 0, fromBlock: 11, head: 10, reorgRecovered: false });
  assert.equal(store.observations().length, 1);
});

test('scanner credits every finalized observation idempotently and records the completed state', async () => {
  const adapter = new FixtureAdapter();
  const store = new InMemoryDepositScanStore();
  const credited: Array<{ accountId: string; transactionHash: string }> = [];
  const scanner = new DepositScanner(adapter, store, policy, { reorgWindow: 2 }, {
    async credit(observation) {
      credited.push({ accountId: observation.accountId, transactionHash: observation.transactionHash });
    },
  });
  const target = { accountId: 'account-1', address: 'T111111111111111111111111111111111', assetCode: 'USDT' };

  await scanner.scan([target], 7);

  assert.deepEqual(credited, [{ accountId: 'account-1', transactionHash: 'tx-001' }]);
  assert.equal(store.observations()[0]?.status, 'credited');
});

test('scanner rolls back a persisted cursor after a reorg and replays only the bounded window', async () => {
  const adapter = new FixtureAdapter();
  const store = new InMemoryDepositScanStore();
  const scanner = new DepositScanner(adapter, store, policy, { reorgWindow: 2 });
  const target = { accountId: 'account-1', address: 'T111111111111111111111111111111111', assetCode: 'USDT' };
  await scanner.scan([target], 7);
  adapter.reorged = true;

  const result = await scanner.scan([target], 7);
  assert.deepEqual(result, { candidates: 1, fromBlock: 8, head: 10, reorgRecovered: true });
  assert.equal(store.observations().length, 1);
  assert.equal((await store.cursor('tron-shasta'))?.blockHash, 'reorg-10');
});

test('scanner limits a recovery scan to a bounded block range and resumes at the persisted boundary', async () => {
  const adapter = new FixtureAdapter();
  adapter.head = 100;
  const store = new InMemoryDepositScanStore();
  const scanner = new DepositScanner(adapter, store, policy, { maxBlockRange: 5, reorgWindow: 2 });
  const target = { accountId: 'account-1', address: 'T111111111111111111111111111111111', assetCode: 'USDT' };

  await scanner.scan([target], 0);

  assert.deepEqual(adapter.queries[0], { contractIdentifier: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj', fromBlock: 0, toBlock: 4, watchedAddresses: [target.address] });
  assert.equal((await store.cursor('tron-shasta'))?.height, 4);
});
