import assert from 'node:assert/strict';
import test from 'node:test';

import { runConfiguredNetwork } from '../src/run-configured-network.js';
import { InMemoryDepositScanStore } from '../src/scanner.js';

test('configured network scan combines database address and asset allow-lists before crediting a finalized transfer', async () => {
  const credits: string[] = [];
  const result = await runConfiguredNetwork({
    adapter: { network: 'ethereum-sepolia', getBlockHash: async () => '0xabc', getHead: async () => 50, listTokenTransfers: async () => [{ amountAtoms: '1000000', blockHash: '0xblock', blockHeight: 9, contractIdentifier: '0x1111111111111111111111111111111111111111', destinationAddress: '0x2222222222222222222222222222222222222222', eventIndex: 0, network: 'ethereum-sepolia', transactionHash: '0xtx' }] },
    catalog: { policies: async () => [{ assetCode: 'USDT', contractIdentifier: '0x1111111111111111111111111111111111111111', minimumConfirmations: 12 }], targets: async () => [{ accountId: 'account-1', address: '0x2222222222222222222222222222222222222222', assetCode: 'USDT' }] },
    creditor: { credit: async (observation) => { credits.push(observation.transactionHash); } },
    firstBlock: 0,
    maxBlockRange: 1000,
    reorgWindow: 32,
    store: new InMemoryDepositScanStore(),
  });
  assert.deepEqual(result, { candidates: 1, fromBlock: 0, head: 50, reorgRecovered: false });
  assert.deepEqual(credits, ['0xtx']);
});
