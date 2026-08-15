import assert from 'node:assert/strict';
import test from 'node:test';

import { RedpandaWorkflowDispatcher } from '../src/redpanda-dispatcher.js';

test('a committed deposit event starts reconciliation with its immutable ledger transaction id', async () => {
  const calls: unknown[] = [];
  const dispatcher = new RedpandaWorkflowDispatcher({
    async startApprovedWithdrawal(input) { calls.push({ type: 'withdrawal', ...input }); },
    async startReconciliation(input) { calls.push({ type: 'reconciliation', ...input }); },
  });

  const result = await dispatcher.consume(JSON.stringify({
    aggregate_id: 'deposit-123', event_id: 'event-123', event_type: 'deposit.credited', payload: { ledger_transaction_id: 'ledger-123' }, schema_version: 1,
  }));

  assert.deepEqual(result, { status: 'dispatched' });
  assert.deepEqual(calls, [{ eventId: 'event-123', ledgerTransactionId: 'ledger-123', type: 'reconciliation' }]);
});

test('an unknown or malformed event is acknowledged without creating a financial workflow', async () => {
  const dispatcher = new RedpandaWorkflowDispatcher({
    async startApprovedWithdrawal() { throw new Error('must not start'); },
    async startReconciliation() { throw new Error('must not start'); },
  });

  await assert.rejects(() => dispatcher.consume('{not json}'), /invalid Redpanda event/);
  assert.deepEqual(await dispatcher.consume(JSON.stringify({
    aggregate_id: 'transfer-123', event_id: 'event-999', event_type: 'internal_transfer.committed', payload: {}, schema_version: 1,
  })), { status: 'ignored' });
  await assert.rejects(() => dispatcher.consume(JSON.stringify({
    aggregate_id: 'deposit-123', event_id: 'event-124', event_type: 'deposit.credited', payload: {}, schema_version: 1,
  })), /ledger_transaction_id/);
});
