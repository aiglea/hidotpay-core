import { DatabaseDepositPolicy } from './deposit-policy.js';
import type { DepositAssetPolicy } from './postgres-deposit-catalog.js';
import { DepositScanner, type DepositChainAdapter, type DepositCreditor, type DepositScanStore, type DepositTarget } from './scanner.js';

export async function runConfiguredNetwork(input: {
  adapter: DepositChainAdapter;
  catalog: { policies(network: string): Promise<DepositAssetPolicy[]>; targets(network: string): Promise<DepositTarget[]> };
  creditor: DepositCreditor;
  firstBlock: number;
  maxBlockRange: number;
  reorgWindow: number;
  store: DepositScanStore;
}): Promise<{ candidates: number; fromBlock: number; head: number; reorgRecovered: boolean }> {
  const [policies, targets] = await Promise.all([input.catalog.policies(input.adapter.network), input.catalog.targets(input.adapter.network)]);
  const scanner = new DepositScanner(input.adapter, input.store, new DatabaseDepositPolicy(input.adapter.network, policies), { maxBlockRange: input.maxBlockRange, reorgWindow: input.reorgWindow }, input.creditor);
  return scanner.scan(targets, input.firstBlock);
}
