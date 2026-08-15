import assert from 'node:assert/strict';
import test from 'node:test';

import { ChainAssetPolicyRegistry } from '../../src/chains/policy.js';
import { DomainError } from '../../src/domain/errors.js';

const registry = new ChainAssetPolicyRegistry([
  {
    assetCode: 'USDT',
    contractIdentifier: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj',
    decimals: 6,
    depositEnabled: true,
    feeAssetCode: 'TRX',
    minimumConfirmations: 19,
    network: 'tron-mainnet',
    withdrawalEnabled: true,
  },
]);

test('only the configured official contract can become a deposit candidate', () => {
  assert.deepEqual(registry.requireDeposit({
    assetCode: 'USDT', confirmationCount: 19, contractIdentifier: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj', network: 'tron-mainnet',
  }), {
    assetCode: 'USDT', contractIdentifier: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj', decimals: 6, depositEnabled: true, feeAssetCode: 'TRX', minimumConfirmations: 19, network: 'tron-mainnet', withdrawalEnabled: true,
  });
  assert.throws(
    () => registry.requireDeposit({ assetCode: 'USDT', confirmationCount: 100, contractIdentifier: 'TNotOfficialContract111111111111111111', network: 'tron-mainnet' }),
    (error: unknown) => error instanceof DomainError && error.code === 'deposit_observation_mismatch',
  );
});

test('chain policy rejects insufficient confirmations, disabled assets, and a decimal mismatch', () => {
  assert.throws(
    () => registry.requireDeposit({ assetCode: 'USDT', confirmationCount: 18, contractIdentifier: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj', network: 'tron-mainnet' }),
    (error: unknown) => error instanceof DomainError && error.code === 'deposit_not_final',
  );
  assert.throws(
    () => registry.requireWithdrawal({ assetCode: 'USDT', decimals: 18, network: 'tron-mainnet' }),
    (error: unknown) => error instanceof DomainError && error.code === 'asset_precision_mismatch',
  );
  const disabled = new ChainAssetPolicyRegistry([{ ...registry.requireDeposit({ assetCode: 'USDT', confirmationCount: 19, contractIdentifier: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj', network: 'tron-mainnet' }), withdrawalEnabled: false }]);
  assert.throws(
    () => disabled.requireWithdrawal({ assetCode: 'USDT', decimals: 6, network: 'tron-mainnet' }),
    (error: unknown) => error instanceof DomainError && error.code === 'chain_asset_not_enabled',
  );
});
