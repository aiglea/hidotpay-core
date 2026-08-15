import assert from 'node:assert/strict';
import test from 'node:test';

import { TronSolidifiedProvider } from '../src/tron-solidified-provider.js';

test('TRON provider reads only solidified blocks and confirmed TRC-20 Transfer events', async () => {
  const requests: Array<{ body?: unknown; url: string }> = [];
  const provider = new TronSolidifiedProvider({
    apiKey: 'trongrid-key-at-least-16-chars',
    fetch: async (url, init) => {
      requests.push({ body: init?.body ? JSON.parse(String(init.body)) : undefined, url: String(url) });
      if (String(url).includes('getnowblock')) return json({ block_header: { raw_data: { number: 100 } } });
      if (String(url).includes('getblockbynum')) return json({ blockID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
      return json({ data: [{ block_number: 99, contract_address: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj', event_index: 2, event_name: 'Transfer', result: { to: 'T111111111111111111111111111111111', value: '1000000' }, transaction_id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }], meta: {} });
    },
    url: 'https://tron.internal',
  });

  assert.equal(await provider.getHead(), 100);
  assert.equal(await provider.getBlockHash(99), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.deepEqual(await provider.listTokenTransfers({ contractIdentifier: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj', fromBlock: 99, toBlock: 99, watchedAddresses: ['T111111111111111111111111111111111'] }), [{ amountAtoms: '1000000', blockHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', blockHeight: 99, contractIdentifier: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj', destinationAddress: 'T111111111111111111111111111111111', eventIndex: 2, transactionHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }]);
  assert.deepEqual(requests.map((request) => request.url.includes('/walletsolidity/getnowblock') ? 'head' : request.url.includes('/walletsolidity/getblockbynum') ? 'block' : 'events'), ['head', 'block', 'block', 'events']);
});

function json(value: unknown): Response { return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }); }
