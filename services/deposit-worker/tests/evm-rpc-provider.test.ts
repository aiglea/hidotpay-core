import assert from 'node:assert/strict';
import test from 'node:test';

import { EvmJsonRpcProvider } from '../src/evm-rpc-provider.js';

test('EVM RPC provider verifies chain data and decodes only ERC-20 Transfer logs for the watched address', async () => {
  const methods: string[] = [];
  const provider = new EvmJsonRpcProvider({
    fetch: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { method: string };
      methods.push(request.method);
      const results: Record<string, unknown> = {
        eth_chainId: '0xaa36a7',
        eth_blockNumber: '0x64',
        eth_getBlockByNumber: { hash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
        eth_getLogs: [{ blockHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', blockNumber: '0x63', data: '0x0f4240', logIndex: '0x3', transactionHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', topics: ['0xddf252ad00000000000000000000000000000000000000000000000000000000', '0x0000000000000000000000001111111111111111111111111111111111111111', '0x0000000000000000000000002222222222222222222222222222222222222222'] }],
      };
      return new Response(JSON.stringify({ id: 1, jsonrpc: '2.0', result: results[request.method] }));
    },
    url: 'https://rpc.internal',
  });

  assert.equal(await provider.getChainId(), 11155111);
  assert.equal(await provider.getHead(), 100);
  assert.equal(await provider.getBlockHash(99), '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.deepEqual(await provider.listTokenTransfers({ contractIdentifier: '0x1111111111111111111111111111111111111111', fromBlock: 99, toBlock: 100, watchedAddresses: ['0x2222222222222222222222222222222222222222'] }), [{ amountAtoms: '1000000', blockHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', blockHeight: 99, contractIdentifier: '0x1111111111111111111111111111111111111111', destinationAddress: '0x2222222222222222222222222222222222222222', logIndex: 3, transactionHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' }]);
  assert.deepEqual(methods, ['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getLogs']);
});
