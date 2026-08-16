import assert from 'node:assert/strict';
import test from 'node:test';

import { BitcoinExplorerProvider } from '../src/bitcoin-provider.js';

test('Bitcoin explorer lists native testnet4 payments inside the requested height range', async () => {
  const calls: string[] = [];
  const provider = new BitcoinExplorerProvider({
    fetch: async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/blocks/tip/height')) return new Response('120');
      if (url.endsWith('/block-height/100')) return new Response('aa'.repeat(32));
      if (url.includes('/address/tb1qcr8te4kr609gcawutmrza0j4xv80jy8zmfp6l0/txs')) {
        return Response.json([{
          txid: 'tx-credit',
          status: { block_hash: 'bb'.repeat(32), block_height: 110, confirmed: true },
          vout: [{ scriptpubkey_address: 'tb1qcr8te4kr609gcawutmrza0j4xv80jy8zmfp6l0', value: 12_345 }],
        }, {
          txid: 'tx-old',
          status: { block_hash: 'hash90', block_height: 90, confirmed: true },
          vout: [{ scriptpubkey_address: 'tb1qcr8te4kr609gcawutmrza0j4xv80jy8zmfp6l0', value: 1 }],
        }]);
      }
      throw new Error(`unexpected ${url}`);
    },
    url: 'https://mempool.space/testnet4/api',
  });

  assert.equal(await provider.getHead(), 120);
  assert.equal(await provider.getBlockHash(100), 'aa'.repeat(32));
  assert.deepEqual(await provider.listTokenTransfers({
    contractIdentifier: 'native:btc',
    fromBlock: 100,
    toBlock: 115,
    watchedAddresses: ['tb1qcr8te4kr609gcawutmrza0j4xv80jy8zmfp6l0'],
  }), [{
    amountAtoms: '12345',
    blockHash: 'bb'.repeat(32),
    blockHeight: 110,
    contractIdentifier: 'native:btc',
    destinationAddress: 'tb1qcr8te4kr609gcawutmrza0j4xv80jy8zmfp6l0',
    logIndex: 0,
    transactionHash: 'tx-credit',
  }]);
  assert.ok(calls.every((url) => url.startsWith('https://mempool.space/testnet4/api')));
});
