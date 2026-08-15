import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

import { depositWorkflow, reconciliationWorkflow, withdrawalWorkflow } from '../src/temporal-workflows.js';

test('Temporal retries a timed-out deposit activity using the immutable deposit id', async () => {
  const environment = await TestWorkflowEnvironment.createTimeSkipping();
  let attempts = 0;
  const taskQueue = `hidotpay-test-${randomUUID()}`;
  const worker = await Worker.create({
    activities: {
      async creditDeposit(input: { depositId: string }) {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary CockroachDB outage');
        return { depositId: input.depositId, status: 'credited' as const };
      },
    },
    connection: environment.nativeConnection,
    taskQueue,
    workflowsPath: fileURLToPath(new URL('../src/temporal-workflows.ts', import.meta.url)),
  });

  try {
    const result = await worker.runUntil(environment.client.workflow.execute(depositWorkflow, {
      args: [{ depositId: 'deposit-123' }],
      taskQueue,
      workflowId: 'deposit:deposit-123',
    }));
    assert.deepEqual(result, { depositId: 'deposit-123', status: 'credited' });
    assert.equal(attempts, 2);
  } finally {
    await environment.teardown();
  }
});

test('Temporal reconciliation uses the immutable ledger transaction id as its only activity key', async () => {
  const environment = await TestWorkflowEnvironment.createTimeSkipping();
  const calls: string[] = [];
  const taskQueue = `hidotpay-test-${randomUUID()}`;
  const worker = await Worker.create({
    activities: {
      async broadcastWithdrawal() { return { confirmed: true, transactionHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' }; },
      async creditDeposit(input: { depositId: string }) { return { depositId: input.depositId, status: 'credited' as const }; },
      async reconcileLedger(input: { ledgerTransactionId: string }) {
        calls.push(input.ledgerTransactionId);
        return { ledgerTransactionId: input.ledgerTransactionId, status: 'applied' as const };
      },
      async requestWithdrawalHumanReview() {},
      async settleConfirmedWithdrawal() {},
    },
    connection: environment.nativeConnection,
    taskQueue,
    workflowsPath: fileURLToPath(new URL('../src/temporal-workflows.ts', import.meta.url)),
  });

  try {
    const result = await worker.runUntil(environment.client.workflow.execute(reconciliationWorkflow, {
      args: [{ ledgerTransactionId: 'ledger-123' }],
      taskQueue,
      workflowId: 'reconciliation:ledger-123',
    }));
    assert.deepEqual(result, { ledgerTransactionId: 'ledger-123', status: 'applied' });
    assert.deepEqual(calls, ['ledger-123']);
  } finally {
    await environment.teardown();
  }
});

test('Temporal reconciliation keeps the same immutable key while Blnk is queued, then completes only after applied', async () => {
  const environment = await TestWorkflowEnvironment.createTimeSkipping();
  const calls: string[] = [];
  const taskQueue = `hidotpay-test-${randomUUID()}`;
  const worker = await Worker.create({
    activities: {
      async reconcileLedger(input: { ledgerTransactionId: string }) {
        calls.push(input.ledgerTransactionId);
        return { ledgerTransactionId: input.ledgerTransactionId, status: calls.length === 1 ? 'queued' as const : 'applied' as const };
      },
    },
    connection: environment.nativeConnection,
    taskQueue,
    workflowsPath: fileURLToPath(new URL('../src/temporal-workflows.ts', import.meta.url)),
  });

  try {
    const result = await worker.runUntil(environment.client.workflow.execute(reconciliationWorkflow, {
      args: [{ ledgerTransactionId: 'ledger-queued-123' }],
      taskQueue,
      workflowId: 'reconciliation:ledger-queued-123',
    }));
    assert.deepEqual(result, { ledgerTransactionId: 'ledger-queued-123', status: 'applied' });
    assert.deepEqual(calls, ['ledger-queued-123', 'ledger-queued-123']);
  } finally {
    await environment.teardown();
  }
});

test('Temporal withdrawal workflow sends an unconfirmed broadcast to human review without releasing funds', async () => {
  const environment = await TestWorkflowEnvironment.createTimeSkipping();
  const calls: string[] = [];
  const taskQueue = `hidotpay-test-${randomUUID()}`;
  const worker = await Worker.create({
    activities: {
      async broadcastWithdrawal() {
        calls.push('broadcast');
        return { confirmed: false, transactionHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' };
      },
      async creditDeposit(input: { depositId: string }) { return { depositId: input.depositId, status: 'credited' as const }; },
      async requestWithdrawalHumanReview() { calls.push('review'); },
      async settleConfirmedWithdrawal() { calls.push('settle'); },
    },
    connection: environment.nativeConnection,
    taskQueue,
    workflowsPath: fileURLToPath(new URL('../src/temporal-workflows.ts', import.meta.url)),
  });

  try {
    const result = await worker.runUntil(environment.client.workflow.execute(withdrawalWorkflow, {
      args: [{ withdrawalId: 'withdrawal-123' }],
      taskQueue,
      workflowId: 'withdrawal:withdrawal-123',
    }));
    assert.deepEqual(result, { status: 'manual_review', withdrawalId: 'withdrawal-123' });
    assert.deepEqual(calls, ['broadcast', 'review']);
  } finally {
    await environment.teardown();
  }
});

test('Temporal never retries a failed withdrawal broadcast activity', async () => {
  const environment = await TestWorkflowEnvironment.createTimeSkipping();
  let attempts = 0;
  const taskQueue = `hidotpay-test-${randomUUID()}`;
  const worker = await Worker.create({
    activities: {
      async broadcastWithdrawal() {
        attempts += 1;
        throw new Error('broadcast transport timed out');
      },
    },
    connection: environment.nativeConnection,
    taskQueue,
    workflowsPath: fileURLToPath(new URL('../src/temporal-workflows.ts', import.meta.url)),
  });

  try {
    await assert.rejects(() => worker.runUntil(environment.client.workflow.execute(withdrawalWorkflow, {
      args: [{ withdrawalId: 'withdrawal-456' }],
      taskQueue,
      workflowId: 'withdrawal:withdrawal-456',
    })));
    assert.equal(attempts, 1);
  } finally {
    await environment.teardown();
  }
});
