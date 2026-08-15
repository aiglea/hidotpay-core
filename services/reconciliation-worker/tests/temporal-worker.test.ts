import assert from 'node:assert/strict';
import test from 'node:test';

import { createReconciliationTemporalWorker } from '../src/temporal-worker.js';

test('the reconciliation Temporal worker exposes only its reconciliation activity on a private queue', async () => {
  const calls: unknown[] = [];
  const created = await createReconciliationTemporalWorker({
    activities: {
      async reconcileLedger(input) { return { ledgerTransactionId: input.ledgerTransactionId, status: 'applied' as const }; },
    },
    connection: { private: true },
    create: async (input) => {
      calls.push(input);
      return { async run() {}, async shutdown() {} };
    },
    namespace: 'hidotpay',
    taskQueue: 'hidotpay-reconciliation-v1',
  });

  assert.equal(typeof created.run, 'function');
  assert.equal(calls.length, 1);
  const options = calls[0] as { activities: { reconcileLedger: unknown }; connection: unknown; namespace: string; taskQueue: string };
  assert.equal(typeof options.activities.reconcileLedger, 'function');
  assert.deepEqual(options.connection, { private: true });
  assert.equal(options.namespace, 'hidotpay');
  assert.equal(options.taskQueue, 'hidotpay-reconciliation-v1');
});
