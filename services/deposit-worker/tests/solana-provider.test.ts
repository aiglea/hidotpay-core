import assert from 'node:assert/strict';
import test from 'node:test';

import { SolanaJsonRpcProvider } from '../src/solana-provider.js';

test('Solana JSON-RPC lists official SPL token transfers to watched addresses', async () => {
  const mint = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
  const provider = new SolanaJsonRpcProvider({
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { method: string };
      if (body.method === 'getSlot') return Response.json({ result: 500 });
      if (body.method === 'getBlock') return Response.json({ result: { blockhash: 'blockhash-400' } });
      if (body.method === 'getSignaturesForAddress') return Response.json({ result: [{ signature: 'sig-1' }] });
      if (body.method === 'getTransaction') {
        return Response.json({
          result: {
            slot: 420,
            transaction: { signatures: ['sig-1'] },
            meta: {
              postTokenBalances: [{
                mint,
                owner: 'So11111111111111111111111111111111111111112',
                uiTokenAmount: { amount: '7700000', decimals: 6 },
              }],
              preTokenBalances: [{
                mint,
                owner: 'So11111111111111111111111111111111111111112',
                uiTokenAmount: { amount: '1000000', decimals: 6 },
              }],
            },
          },
        });
      }
      throw new Error(body.method);
    },
    url: 'https://api.devnet.solana.com',
  });

  assert.equal(await provider.getHead(), 500);
  assert.equal(await provider.getBlockHash(400), 'blockhash-400');
  assert.deepEqual(await provider.listTokenTransfers({
    contractIdentifier: mint,
    fromBlock: 400,
    toBlock: 450,
    watchedAddresses: ['So11111111111111111111111111111111111111112'],
  }), [{
    amountAtoms: '6700000',
    blockHash: 'blockhash-400',
    blockHeight: 420,
    contractIdentifier: mint,
    destinationAddress: 'So11111111111111111111111111111111111111112',
    logIndex: 0,
    transactionHash: 'sig-1',
  }]);
});
