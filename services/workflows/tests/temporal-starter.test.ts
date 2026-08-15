import assert from 'node:assert/strict';
import test from 'node:test';

import { TemporalWorkflowStarter } from '../src/temporal-starter.js';

test('a duplicate credited-deposit event starts exactly one immutable reconciliation workflow id', async () => {
  const calls: unknown[] = [];
  const starter = new TemporalWorkflowStarter({
    async start(workflowType, options) { calls.push({ options, workflowType }); },
  }, 'hidotpay-financial-v1');

  await starter.startReconciliation({ eventId: 'event-123', ledgerTransactionId: 'ledger-123' });
  await starter.startReconciliation({ eventId: 'event-123', ledgerTransactionId: 'ledger-123' });

  assert.deepEqual(calls, [
    {
      options: {
        args: [{ ledgerTransactionId: 'ledger-123' }],
        memo: { outbox_event_id: 'event-123' },
        taskQueue: 'hidotpay-financial-v1',
        workflowId: 'reconciliation:ledger-123',
        workflowIdConflictPolicy: 'USE_EXISTING',
        workflowIdReusePolicy: 'REJECT_DUPLICATE',
      },
      workflowType: 'reconciliationWorkflow',
    },
    {
      options: {
        args: [{ ledgerTransactionId: 'ledger-123' }],
        memo: { outbox_event_id: 'event-123' },
        taskQueue: 'hidotpay-financial-v1',
        workflowId: 'reconciliation:ledger-123',
        workflowIdConflictPolicy: 'USE_EXISTING',
        workflowIdReusePolicy: 'REJECT_DUPLICATE',
      },
      workflowType: 'reconciliationWorkflow',
    },
  ]);
});

test('an approved withdrawal event starts one durable workflow with a non-reusable id', async () => {
  const calls: unknown[] = [];
  const starter = new TemporalWorkflowStarter({
    async start(workflowType, options) { calls.push({ options, workflowType }); },
  }, 'hidotpay-financial-v1');

  await starter.startApprovedWithdrawal({ aggregateId: 'withdrawal-123', eventId: 'event-456' });

  assert.deepEqual(calls, [{
    options: {
      args: [{ withdrawalId: 'withdrawal-123' }],
      memo: { outbox_event_id: 'event-456' },
      taskQueue: 'hidotpay-financial-v1',
      workflowId: 'withdrawal:withdrawal-123',
      workflowIdConflictPolicy: 'USE_EXISTING',
      workflowIdReusePolicy: 'REJECT_DUPLICATE',
    },
    workflowType: 'withdrawalWorkflow',
  }]);
});
