import assert from 'node:assert/strict';
import test from 'node:test';

import { createReconciliationTemporalActivities } from '../src/temporal-activities.js';

test('Temporal reconciliation activity forwards only the immutable ledger transaction id and preserves a queued result', async () => {
  const calls: string[] = [];
  const activities = createReconciliationTemporalActivities({
    async reconcileLedgerTransaction(ledgerTransactionId) {
      calls.push(ledgerTransactionId);
      return { ledgerTransactionId, status: 'queued' as const };
    },
  });

  assert.deepEqual(await activities.reconcileLedger({ ledgerTransactionId: 'ledger-123' }), {
    ledgerTransactionId: 'ledger-123',
    status: 'queued',
  });
  assert.deepEqual(calls, ['ledger-123']);
});
