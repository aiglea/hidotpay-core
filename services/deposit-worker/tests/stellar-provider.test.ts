import assert from 'node:assert/strict';
import test from 'node:test';

import { StellarHorizonProvider } from '../src/stellar-provider.js';

test('Stellar Horizon lists official test USDC payments to watched accounts', async () => {
  const issuer = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
  const provider = new StellarHorizonProvider({
    fetch: async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/ledgers' && url.searchParams.get('order') === 'desc') {
        return Response.json({ _embedded: { records: [{ sequence: 90, hash: 'headhash' }] } });
      }
      if (url.pathname.startsWith('/ledgers/') && url.pathname !== '/ledgers') {
        const sequence = url.pathname.split('/')[2] ?? '';
        return Response.json({ hash: `${sequence}`.padStart(8, '0').repeat(8), sequence: Number(sequence) });
      }
      if (url.pathname.endsWith('/payments')) {
        return Response.json({
          _embedded: {
            records: [{
              id: 'pay-1',
              type: 'payment',
              to: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
              amount: '1.2500000',
              asset_type: 'credit_alphanum4',
              asset_code: 'USDC',
              asset_issuer: issuer,
              transaction_hash: 'txhash',
              ledger: 85,
            }],
          },
        });
      }
      throw new Error(url.pathname);
    },
    url: 'https://horizon-testnet.stellar.org',
  });

  assert.equal(await provider.getHead(), 90);
  assert.equal(await provider.getBlockHash(80), '00000080'.repeat(8));
  assert.deepEqual(await provider.listTokenTransfers({
    contractIdentifier: `USDC:${issuer}`,
    fromBlock: 80,
    toBlock: 88,
    watchedAddresses: ['GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'],
  }), [{
    amountAtoms: '1250000',
    blockHash: '00000085'.repeat(8),
    blockHeight: 85,
    contractIdentifier: `USDC:${issuer}`,
    destinationAddress: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    logIndex: 0,
    transactionHash: 'txhash',
  }]);
});
