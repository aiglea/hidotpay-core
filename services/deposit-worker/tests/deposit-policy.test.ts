import assert from 'node:assert/strict';
import test from 'node:test';

import { DatabaseDepositPolicy } from '../src/deposit-policy.js';

test('database deposit policy permits only the registered contract after its stored confirmation threshold', () => {
  const policy = new DatabaseDepositPolicy('ethereum-sepolia', [{ assetCode: 'USDT', contractIdentifier: '0x1111111111111111111111111111111111111111', minimumConfirmations: 12 }]);
  assert.deepEqual(policy.get('ethereum-sepolia', 'USDT'), { contractIdentifier: '0x1111111111111111111111111111111111111111' });
  assert.doesNotThrow(() => policy.requireDeposit({ assetCode: 'USDT', confirmationCount: 12, contractIdentifier: '0x1111111111111111111111111111111111111111', network: 'ethereum-sepolia' }));
  assert.throws(() => policy.requireDeposit({ assetCode: 'USDT', confirmationCount: 11, contractIdentifier: '0x1111111111111111111111111111111111111111', network: 'ethereum-sepolia' }), /deposit is not final/);
  assert.throws(() => policy.requireDeposit({ assetCode: 'USDT', confirmationCount: 12, contractIdentifier: '0x2222222222222222222222222222222222222222', network: 'ethereum-sepolia' }), /deposit contract is not official/);
});
