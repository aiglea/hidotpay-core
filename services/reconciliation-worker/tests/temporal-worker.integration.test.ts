import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

import { createReconciliationTemporalActivities } from '../src/temporal-activities.js';
import { createReconciliationTemporalWorker } from '../src/temporal-worker.js';
import { reconciliationWorkflow } from '../../workflows/src/temporal-workflows.js';

test('Temporal executes reconciliation through the private activity-only worker', async () => {
  const environment = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `hidotpay-reconciliation-${randomUUID()}`;
  const calls: string[] = [];
  const activityWorker = await createReconciliationTemporalWorker({
    activities: createReconciliationTemporalActivities({
      async reconcileLedgerTransaction(ledgerTransactionId) {
        calls.push(ledgerTransactionId);
        return { ledgerTransactionId, status: 'applied' as const };
      },
    }),
    connection: environment.nativeConnection,
    create: ({ activities, namespace, taskQueue: queue }) => Worker.create({ activities, connection: environment.nativeConnection, namespace, taskQueue: queue }),
    namespace: 'default',
    taskQueue,
  });
  const workflowWorker = await Worker.create({
    connection: environment.nativeConnection,
    taskQueue,
    workflowsPath: fileURLToPath(new URL('../../workflows/src/temporal-workflows.ts', import.meta.url)),
  });
  const activityRun = activityWorker.run();

  try {
    const result = await workflowWorker.runUntil(environment.client.workflow.execute(reconciliationWorkflow, {
      args: [{ ledgerTransactionId: 'ledger-temporal-123' }],
      taskQueue,
      workflowId: 'reconciliation:ledger-temporal-123',
    }));
    assert.deepEqual(result, { ledgerTransactionId: 'ledger-temporal-123', status: 'applied' });
    assert.deepEqual(calls, ['ledger-temporal-123']);
  } finally {
    await activityWorker.shutdown();
    await activityRun;
    await environment.teardown();
  }
});
