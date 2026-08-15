import assert from 'node:assert/strict';
import test from 'node:test';

import { WithdrawalExecutionWorker } from '../src/withdrawal-execution.js';

const withdrawal = {
  amountAtoms: '1000000', assetCode: 'USDT', destinationAddress: '0x1111111111111111111111111111111111111111',
  id: 'c1b03d51-1d58-4f5c-b37f-9d94ec52ced8', network: 'ethereum-sepolia', signedPayload: 'unsigned-payload',
};

test('signer rejection releases the pre-broadcast freeze', async () => {
  const calls: string[] = [];
  const worker = new WithdrawalExecutionWorker({
    async markBroadcast() { calls.push('broadcast'); },
    async releaseBeforeBroadcast(id, reason) { calls.push(`release:${id}:${reason}`); },
    async settleConfirmed() { calls.push('settle'); },
  }, { broadcaster: {
    async broadcast() { calls.push('chain'); return { confirmed: false }; },
  }, signer: {
    async sign() { throw new Error('signer policy rejected request'); },
  },
  });

  await assert.rejects(() => worker.execute(withdrawal), /signer policy rejected request/);
  assert.deepEqual(calls, [`release:${withdrawal.id}:signer policy rejected request`]);
});

test('a broadcast transport error never releases user funds after the transaction hash is durably recorded', async () => {
  const calls: string[] = [];
  const worker = new WithdrawalExecutionWorker({
    async markBroadcast(id, hash) { calls.push(`mark:${id}:${hash}`); },
    async releaseBeforeBroadcast() { calls.push('release'); },
    async settleConfirmed() { calls.push('settle'); },
  }, { broadcaster: {
    async broadcast() { calls.push('chain'); throw new Error('RPC timed out after submission'); },
  }, signer: {
    async sign() { return { chainTransactionHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', signedPayload: 'signed-payload' }; },
  },
  });

  await assert.rejects(() => worker.execute(withdrawal), /RPC timed out after submission/);
  assert.deepEqual(calls, [
    `mark:${withdrawal.id}:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`,
    'chain',
  ]);
});

test('only a confirmed broadcast settles the frozen balance', async () => {
  const calls: string[] = [];
  const worker = new WithdrawalExecutionWorker({
    async markBroadcast() { calls.push('mark'); },
    async releaseBeforeBroadcast() { calls.push('release'); },
    async settleConfirmed(id, hash) { calls.push(`settle:${id}:${hash}`); },
  }, { broadcaster: {
    async broadcast() { calls.push('chain'); return { confirmed: true }; },
  }, signer: {
    async sign() { return { chainTransactionHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', signedPayload: 'signed-payload' }; },
  },
  });

  assert.deepEqual(await worker.execute(withdrawal), { status: 'confirmed', withdrawalId: withdrawal.id });
  assert.deepEqual(calls, [
    'mark',
    'chain',
    `settle:${withdrawal.id}:0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`,
  ]);
});
