import assert from 'node:assert/strict';
import test from 'node:test';

import { LedgerDepositCreditor } from '../src/ledger-deposit-creditor.js';

const observation = {
  accountId: '11111111-1111-4111-8111-111111111111', amountAtoms: '1000000', assetCode: 'USDT', blockHash: '0xabc12345', blockHeight: 100, confirmationCount: 3, contractIdentifier: '0x1111111111111111111111111111111111111111', destinationAddress: '0x2222222222222222222222222222222222222222', eventIndex: 3, network: 'ethereum-sepolia', status: 'finalized_candidate' as const, transactionHash: '0x3333333333333333333333333333333333333333333333333333333333333333',
};

test('deposit worker sends only a finalized public observation to the private ledger API', async () => {
  const requests: Array<{ body: unknown; headers: Headers; url: string }> = [];
  const creditor = new LedgerDepositCreditor({
    bearerToken: 'chain-worker-token-at-least-16-chars',
    fetch: async (url, init) => {
      requests.push({ body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers), url: String(url) });
      return new Response(JSON.stringify({ deposit_id: 'deposit-123', ledger_transaction_id: 'ledger-123', status: 'credited' }), { status: 201 });
    },
    url: 'https://ledger.internal',
  });

  await creditor.credit(observation);

  assert.equal(requests[0]?.url, 'https://ledger.internal/v1/deposits/confirmed');
  assert.equal(requests[0]?.headers.get('authorization'), 'Bearer chain-worker-token-at-least-16-chars');
  assert.deepEqual(requests[0]?.body, {
    amount_atoms: '1000000', asset_code: 'USDT', block_hash: '0xabc12345', block_height: '100', confirmation_count: 3, contract_identifier: '0x1111111111111111111111111111111111111111', destination_account_id: '11111111-1111-4111-8111-111111111111', network: 'ethereum-sepolia', output_index: 3, transaction_hash: '0x3333333333333333333333333333333333333333333333333333333333333333',
  });
});

test('deposit worker refuses an insecure ledger endpoint and an unsuccessful credit response', async () => {
  assert.throws(() => new LedgerDepositCreditor({ bearerToken: 'chain-worker-token-at-least-16-chars', url: 'http://ledger.internal' }), /private HTTPS/);
  const creditor = new LedgerDepositCreditor({
    bearerToken: 'chain-worker-token-at-least-16-chars',
    fetch: async () => new Response('denied', { status: 403 }),
    url: 'https://ledger.internal',
  });
  await assert.rejects(() => creditor.credit(observation), /ledger deposit credit failed/);
});
