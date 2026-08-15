import assert from 'node:assert/strict';
import test from 'node:test';

import { executeWithdrawalWorkflow, workflowId } from '../src/workflow-contract.js';

test('a withdrawal whose chain broadcast is unconfirmed stops for human review and never releases funds', async () => {
  const calls: string[] = [];
  const result = await executeWithdrawalWorkflow({ withdrawalId: 'withdrawal-123' }, {
    async broadcast() { calls.push('broadcast'); return { confirmed: false, transactionHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }; },
    async releaseBeforeBroadcast() { calls.push('release'); },
    async settleConfirmed() { calls.push('settle'); },
    async requestHumanReview() { calls.push('review'); },
  });

  assert.deepEqual(result, { status: 'manual_review', withdrawalId: 'withdrawal-123' });
  assert.deepEqual(calls, ['broadcast', 'review']);
});

test('financial workflow ids are stable per immutable source event', () => {
  assert.equal(workflowId.deposit('deposit-123'), 'deposit:deposit-123');
  assert.equal(workflowId.reconciliation('ledger-123'), 'reconciliation:ledger-123');
  assert.equal(workflowId.withdrawal('withdrawal-123'), 'withdrawal:withdrawal-123');
});
