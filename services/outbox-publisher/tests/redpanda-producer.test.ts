import assert from 'node:assert/strict';
import test from 'node:test';

import { RedpandaEventProducer } from '../src/redpanda-producer.js';

test('Redpanda producer sends a versioned event keyed by immutable outbox id', async () => {
  const calls: unknown[] = [];
  const producer = new RedpandaEventProducer({
    async send(input) { calls.push(input); },
  }, 'hidotpay.events.v1');

  await producer.publish({
    aggregateId: '1f865b2d-3ad6-4cb9-848e-4b5a59459a3f', attempts: 0, eventType: 'deposit.credited',
    id: 'c1b03d51-1d58-4f5c-b37f-9d94ec52ced8', payload: { amount_atoms: '1000001', asset_code: 'USDT' },
  });

  assert.deepEqual(calls, [{
    acks: -1,
    messages: [{
      headers: { 'event-type': 'deposit.credited', 'schema-version': '1' },
      key: 'c1b03d51-1d58-4f5c-b37f-9d94ec52ced8',
      value: JSON.stringify({
        aggregate_id: '1f865b2d-3ad6-4cb9-848e-4b5a59459a3f', event_id: 'c1b03d51-1d58-4f5c-b37f-9d94ec52ced8',
        event_type: 'deposit.credited', occurred_at: undefined, payload: { amount_atoms: '1000001', asset_code: 'USDT' }, schema_version: 1,
      }),
    }],
    topic: 'hidotpay.events.v1',
  }]);
});
