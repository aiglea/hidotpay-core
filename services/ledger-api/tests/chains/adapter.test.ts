import assert from 'node:assert/strict';
import test from 'node:test';

import { EvmAdapter, TronAdapter, type EvmRpcProvider, type TronRpcProvider } from '../../src/chains/adapter.js';
import { DomainError } from '../../src/domain/errors.js';

test('EVM adapter falls back when its primary RPC is unavailable and never credits balances itself', async () => {
  const unavailable: EvmRpcProvider = {
    getBlockHash: async () => { throw new Error('primary unavailable'); },
    getChainId: async () => { throw new Error('primary unavailable'); },
    getHead: async () => { throw new Error('primary unavailable'); },
    listTokenTransfers: async () => { throw new Error('primary unavailable'); },
  };
  const backup: EvmRpcProvider = {
    getBlockHash: async (height) => `0x${height}`,
    getChainId: async () => 11155111,
    getHead: async () => 123456,
    listTokenTransfers: async () => [{ amountAtoms: '500000', blockHash: '0xblock', blockHeight: 123450, contractIdentifier: '0x1111111111111111111111111111111111111111', destinationAddress: '0x2222222222222222222222222222222222222222', logIndex: 7, transactionHash: '0xtx' }],
  };
  const adapter = new EvmAdapter('ethereum-sepolia', 11155111, [unavailable, backup]);
  assert.equal(await adapter.getHead(), 123456);
  assert.deepEqual(await adapter.listTokenTransfers({
    contractIdentifier: '0x1111111111111111111111111111111111111111', fromBlock: 123450, toBlock: 123456, watchedAddresses: ['0x2222222222222222222222222222222222222222'],
  }), [{ amountAtoms: '500000', blockHash: '0xblock', blockHeight: 123450, contractIdentifier: '0x1111111111111111111111111111111111111111', destinationAddress: '0x2222222222222222222222222222222222222222', eventIndex: 7, network: 'ethereum-sepolia', transactionHash: '0xtx' }]);
});

test('chain adapters reject a provider on the wrong network instead of trusting its data', async () => {
  const wrongEvm: EvmRpcProvider = {
    getBlockHash: async () => '0x1',
    getChainId: async () => 1,
    getHead: async () => 1,
    listTokenTransfers: async () => [],
  };
  const evm = new EvmAdapter('ethereum-sepolia', 11155111, [wrongEvm]);
  await assert.rejects(
    () => evm.getHead(),
    (error: unknown) => error instanceof DomainError && error.code === 'chain_rpc_unavailable',
  );

  const wrongTron: TronRpcProvider = {
    getBlockHash: async () => 'block-1',
    getHead: async () => 1,
    getNetworkId: async () => 'wrong-network',
    listTokenTransfers: async () => [],
  };
  const tron = new TronAdapter('tron-shasta', 'tron-shasta', [wrongTron]);
  await assert.rejects(
    () => tron.getHead(),
    (error: unknown) => error instanceof DomainError && error.code === 'chain_rpc_unavailable',
  );
});
