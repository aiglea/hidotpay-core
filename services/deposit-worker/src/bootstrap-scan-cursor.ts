import type { DepositChainAdapter, DepositScanStore } from './scanner.js';

export async function bootstrapScanCursor(input: {
  adapter: DepositChainAdapter;
  reorgWindow: number;
  store: DepositScanStore;
}): Promise<{ bootstrapped: boolean; head: number }> {
  const existing = await input.store.cursor(input.adapter.network);
  const head = await input.adapter.getHead();
  if (existing) return { bootstrapped: false, head };
  const safeHead = head - input.reorgWindow;
  if (safeHead < 0) return { bootstrapped: true, head };
  await input.store.saveCursor(input.adapter.network, {
    blockHash: await input.adapter.getBlockHash(safeHead),
    height: safeHead,
  });
  return { bootstrapped: true, head };
}
