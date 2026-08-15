import assert from 'node:assert/strict';
import test from 'node:test';

import { TronFailoverAdapter } from '../src/tron-failover-adapter.js';

test('TRON adapter refuses a provider with the wrong genesis block and uses the verified backup', async () => {
  const wrong = { getBlockHash: async () => 'f'.repeat(64), getHead: async () => 1, listTokenTransfers: async () => [] };
  const backup = { getBlockHash: async (height: number) => height === 0 ? 'a'.repeat(64) : 'b'.repeat(64), getHead: async () => 100, listTokenTransfers: async () => [{ amountAtoms: '1', blockHash: 'b'.repeat(64), blockHeight: 99, contractIdentifier: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj', destinationAddress: 'T111111111111111111111111111111111', eventIndex: 0, transactionHash: 'c'.repeat(64) }] };
  const adapter = new TronFailoverAdapter('tron-shasta', 'a'.repeat(64), [wrong, backup]);
  assert.equal(await adapter.getHead(), 100);
  assert.deepEqual(await adapter.listTokenTransfers({ contractIdentifier: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj', fromBlock: 99, toBlock: 99, watchedAddresses: ['T111111111111111111111111111111111'] }), [{ amountAtoms: '1', blockHash: 'b'.repeat(64), blockHeight: 99, contractIdentifier: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj', destinationAddress: 'T111111111111111111111111111111111', eventIndex: 0, network: 'tron-shasta', transactionHash: 'c'.repeat(64) }]);
});
