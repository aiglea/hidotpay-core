import assert from 'node:assert/strict';
import test from 'node:test';

import { DomainError } from '../../src/domain/errors.js';
import { FundingService, fixedWithdrawalFeePolicy } from '../../src/services/funding-service.js';

const validInput = {
  amountAtoms: '1000000',
  assetCode: 'USDT',
  blockHash: '0xabc12345',
  blockHeight: '100',
  confirmationCount: 12,
  contractIdentifier: '0x1111111111111111111111111111111111111111',
  destinationAccountId: '11111111-1111-4111-8111-111111111111',
  network: 'ethereum-sepolia',
  outputIndex: 0,
  transactionHash: '0x3333333333333333333333333333333333333333333333333333333333333333',
};

test('funding service refuses a mainnet deposit before the repository is touched', async () => {
  let repositoryCalls = 0;
  const funding = new FundingService({
    confirmDeposit: async () => {
      repositoryCalls += 1;
      return { created: true, depositId: 'deposit-1', transferId: 'tx-1' };
    },
    createWithdrawalFeeQuote: async () => {
      throw new Error('unused');
    },
    requestWithdrawal: async () => {
      throw new Error('unused');
    },
  }, fixedWithdrawalFeePolicy({ 'ethereum-sepolia:USDT': '0' }));

  await assert.rejects(
    () => funding.confirmDeposit('chain-operator', { ...validInput, network: 'ethereum-mainnet' }),
    (error: unknown) => error instanceof DomainError && error.code === 'deposit_mainnet_disabled',
  );
  assert.equal(repositoryCalls, 0);
});

test('funding service credits an official testnet observation through the existing ledger repository', async () => {
  const calls: unknown[] = [];
  const funding = new FundingService({
    confirmDeposit: async (input) => {
      calls.push(input);
      return { created: true, depositId: 'deposit-1', transferId: 'tx-1' };
    },
    createWithdrawalFeeQuote: async () => {
      throw new Error('unused');
    },
    requestWithdrawal: async () => {
      throw new Error('unused');
    },
  }, fixedWithdrawalFeePolicy({ 'ethereum-sepolia:USDT': '0' }));

  const result = await funding.confirmDeposit('chain-operator', validInput);
  assert.deepEqual(result, { created: true, depositId: 'deposit-1', transferId: 'tx-1' });
  assert.equal(calls.length, 1);
  assert.equal((calls[0] as { actorId: string }).actorId, 'chain-operator');
  assert.equal((calls[0] as { network: string }).network, 'ethereum-sepolia');
});
