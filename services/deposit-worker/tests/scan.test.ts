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

test('scanner returns safely without side effects when no safe block is available', async () => {
  const adapter = new FixtureAdapter();
  adapter.head = 8;
  const store = new InMemoryDepositScanStore();
  const credited: string[] = [];
  const scanner = new DepositScanner(adapter, store, policy, { reorgWindow: 2 }, {
    async credit(observation) { credited.push(observation.transactionHash); },
  });
  const target = { accountId: 'account-1', address: 'T111111111111111111111111111111111', assetCode: 'USDT' };

  const result = await scanner.scan([target], 7);

  assert.deepEqual(result, { candidates: 0, fromBlock: 7, head: 8, reorgRecovered: false });
  assert.deepEqual(adapter.queries, []);
  assert.deepEqual(credited, []);
  assert.equal(await store.cursor('tron-shasta'), undefined);
  assert.deepEqual(store.observations(), []);
});

test('scanner only scans through the safe head and never advances its cursor into the reorg window', async () => {
  const adapter = new FixtureAdapter();
  const store = new InMemoryDepositScanStore();
  const scanner = new DepositScanner(adapter, store, policy, { reorgWindow: 2 });
  const target = { accountId: 'account-1', address: 'T111111111111111111111111111111111', assetCode: 'USDT' };

  const first = await scanner.scan([target], 7);
  assert.deepEqual(first, { candidates: 1, fromBlock: 7, head: 10, reorgRecovered: false });
  assert.deepEqual(adapter.queries, [{ contractIdentifier: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj', fromBlock: 7, toBlock: 8, watchedAddresses: [target.address] }]);
  assert.equal(store.observations().length, 1);
  assert.equal(store.observations()[0]?.status, 'finalized_candidate');
  assert.equal((await store.cursor('tron-shasta'))?.height, 8);

  const afterRestart = await scanner.scan([target], 7);
  assert.deepEqual(afterRestart, { candidates: 0, fromBlock: 9, head: 10, reorgRecovered: false });
  assert.equal(store.observations().length, 1);
});

test('scanner credits a finalized observation once and does not re-credit it after restart', async () => {
  const adapter = new FixtureAdapter();
  const store = new InMemoryDepositScanStore();
  const credited: Array<{ accountId: string; transactionHash: string }> = [];
  const scanner = new DepositScanner(adapter, store, policy, { reorgWindow: 2 }, {
    async credit(observation) {
      credited.push({ accountId: observation.accountId, transactionHash: observation.transactionHash });
    },
  });
  const target = { accountId: 'account-1', address: 'T111111111111111111111111111111111', assetCode: 'USDT' };

  await scanner.scan([target, target], 7);

  assert.deepEqual(credited, [{ accountId: 'account-1', transactionHash: 'tx-001' }]);
  assert.equal(store.observations()[0]?.status, 'credited');
});

test('scanner fails closed on a deep reorg without changing stored data or crediting again', async () => {
  const adapter = new FixtureAdapter();
  const store = new InMemoryDepositScanStore();
  const credited: string[] = [];
  const scanner = new DepositScanner(adapter, store, policy, { reorgWindow: 2 }, { async credit(observation) { credited.push(observation.transactionHash); } });
  const target = { accountId: 'account-1', address: 'T111111111111111111111111111111111', assetCode: 'USDT' };
  await scanner.scan([target], 7);
  const cursorBeforeReorg = await store.cursor('tron-shasta');
  const observationsBeforeReorg = store.observations();
  const queriesBeforeReorg = adapter.queries.length;
  adapter.reorged = true;

  await assert.rejects(() => scanner.scan([target], 7), /deep_chain_reorg_detected/);
  assert.deepEqual(await store.cursor('tron-shasta'), cursorBeforeReorg);
  assert.deepEqual(store.observations(), observationsBeforeReorg);
  assert.equal(adapter.queries.length, queriesBeforeReorg);
  assert.deepEqual(credited, ['tx-001']);
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

test('scanner retries an uncredited observation after a creditor failure without advancing the cursor', async () => {
  const adapter = new FixtureAdapter();
  const store = new InMemoryDepositScanStore();
  let attempts = 0;
  const scanner = new DepositScanner(adapter, store, policy, { reorgWindow: 2 }, {
    async credit() {
      attempts += 1;
      if (attempts === 1) throw new Error('creditor_temporarily_unavailable');
    },
  });
  const target = { accountId: 'account-1', address: 'T111111111111111111111111111111111', assetCode: 'USDT' };

  await assert.rejects(() => scanner.scan([target], 7), /creditor_temporarily_unavailable/);
  assert.equal((await store.cursor('tron-shasta')), undefined);
  assert.equal(store.observations()[0]?.status, 'finalized_candidate');

  await scanner.scan([target], 7);
  assert.equal(attempts, 2);
  assert.equal(store.observations()[0]?.status, 'credited');
  assert.equal((await store.cursor('tron-shasta'))?.height, 8);
});

test('scanner refuses historical orphaned credits before any network query, credit, or write', async () => {
  const adapter = new FixtureAdapter();
  class HistoricalCreditStore extends InMemoryDepositScanStore {
    public override async assertNoOrphanedCredits(): Promise<void> {
      throw new Error('orphaned_credited_deposit_detected');
    }
  }
  const store = new HistoricalCreditStore();
  const credited: string[] = [];
  const scanner = new DepositScanner(adapter, store, policy, { reorgWindow: 2 }, { async credit(observation) { credited.push(observation.transactionHash); } });
  const target = { accountId: 'account-1', address: 'T111111111111111111111111111111111', assetCode: 'USDT' };

  await assert.rejects(() => scanner.scan([target], 7), /orphaned_credited_deposit_detected/);
  assert.deepEqual(adapter.queries, []);
  assert.deepEqual(credited, []);
  assert.equal(await store.cursor('tron-shasta'), undefined);
  assert.deepEqual(store.observations(), []);
});
