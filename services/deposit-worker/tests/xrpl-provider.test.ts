import assert from 'node:assert/strict';
import test from 'node:test';

import { XrplJsonRpcProvider } from '../src/xrpl-provider.js';

test('XRPL JSON-RPC lists native XRP payments inside the requested ledger range', async () => {
  const provider = new XrplJsonRpcProvider({
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { method: string; params: Array<Record<string, unknown>> };
      if (body.method === 'ledger_current') return Response.json({ result: { ledger_current_index: 40, status: 'success' } });
      if (body.method === 'ledger') return Response.json({ result: { ledger_hash: 'a'.repeat(64), status: 'success' } });
      if (body.method === 'account_tx') {
        return Response.json({
          result: {
            status: 'success',
            transactions: [{
              tx: {
                TransactionType: 'Payment',
                Destination: 'rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v3',
                Amount: '2500000',
                hash: 'b'.repeat(64),
                ledger_index: 33,
              },
              meta: { TransactionIndex: 2, TransactionResult: 'tesSUCCESS' },
            }],
          },
        });
      }
      throw new Error(body.method);
    },
    url: 'https://testnet.xrpl-labs.com',
  });

  assert.equal(await provider.getHead(), 40);
  assert.equal(await provider.getBlockHash(33), 'a'.repeat(64));
  assert.deepEqual(await provider.listTokenTransfers({
    contractIdentifier: 'native:xrp',
    fromBlock: 30,
    toBlock: 35,
    watchedAddresses: ['rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v3'],
  }), [{
    amountAtoms: '2500000',
    blockHash: 'a'.repeat(64),
    blockHeight: 33,
    contractIdentifier: 'native:xrp',
    destinationAddress: 'rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v3',
    logIndex: 2,
    transactionHash: 'b'.repeat(64),
  }]);
});
