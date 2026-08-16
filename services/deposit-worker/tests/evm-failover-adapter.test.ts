import assert from 'node:assert/strict';
import test from 'node:test';

import { EvmFailoverAdapter } from '../src/evm-failover-adapter.js';

test('EVM deposit adapter skips an unavailable or wrong-chain RPC and uses the verified backup', async () => {
  const unavailable = {
    getBlockHash: async () => { throw new Error('offline'); }, getChainId: async () => { throw new Error('offline'); }, getHead: async () => { throw new Error('offline'); }, listTokenTransfers: async () => { throw new Error('offline'); },
  };
  const wrongChain = {
    getBlockHash: async () => '0x0', getChainId: async () => 1, getHead: async () => 1, listTokenTransfers: async () => [],
  };
  const backup = {
    getBlockHash: async () => '0xabc', getChainId: async () => 11155111, getHead: async () => 100, listTokenTransfers: async () => [{ amountAtoms: '1', blockHash: '0xabc', blockHeight: 99, contractIdentifier: '0x1111111111111111111111111111111111111111', destinationAddress: '0x2222222222222222222222222222222222222222', logIndex: 0, transactionHash: '0xtx' }],
  };
  const adapter = new EvmFailoverAdapter('ethereum-sepolia', 11155111, [unavailable, wrongChain, backup]);
  await assert.rejects(
    () => new EvmFailoverAdapter('ethereum-sepolia', 11155111, [unavailable, wrongChain]).getHead(),
    (error: unknown) => error instanceof Error && /offline/.test(error.message) && /wrong chain/.test(error.message),
  );
  assert.equal(await adapter.getHead(), 100);
  assert.deepEqual(await adapter.listTokenTransfers({ contractIdentifier: '0x1111111111111111111111111111111111111111', fromBlock: 99, toBlock: 100, watchedAddresses: ['0x2222222222222222222222222222222222222222'] }), [{ amountAtoms: '1', blockHash: '0xabc', blockHeight: 99, contractIdentifier: '0x1111111111111111111111111111111111111111', destinationAddress: '0x2222222222222222222222222222222222222222', eventIndex: 0, network: 'ethereum-sepolia', transactionHash: '0xtx' }]);
});
