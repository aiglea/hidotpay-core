import assert from 'node:assert/strict';
import test from 'node:test';

import { PostgresDepositCatalog } from '../src/postgres-deposit-catalog.js';

test('deposit catalog reads only active user deposit addresses and enabled official assets for one configured network', async () => {
  const calls: unknown[][] = [];
  const catalog = new PostgresDepositCatalog({
    async query(_sql: string, values: unknown[]) {
      calls.push(values);
      if (calls.length === 1) return { rows: [{ account_id: 'account-1', address: '0x2222222222222222222222222222222222222222', asset_code: 'USDT' }] };
      return { rows: [{ asset_code: 'USDT', contract_identifier: '0x1111111111111111111111111111111111111111', minimum_confirmations: '12' }] };
    },
  });

  assert.deepEqual(await catalog.targets('ethereum-sepolia'), [{ accountId: 'account-1', address: '0x2222222222222222222222222222222222222222', assetCode: 'USDT' }]);
  assert.deepEqual(await catalog.policies('ethereum-sepolia'), [{ assetCode: 'USDT', contractIdentifier: '0x1111111111111111111111111111111111111111', minimumConfirmations: 12 }]);
  assert.deepEqual(calls, [[['ethereum-sepolia', 'ethereum'], 'ethereum-sepolia'], ['ethereum-sepolia']]);
});
