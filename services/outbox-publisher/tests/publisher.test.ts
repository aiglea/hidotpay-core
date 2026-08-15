import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryOutboxStore, OutboxPublisher } from '../src/publisher.js';

test('a broker failure leaves the already-committed financial event pending for retry', async () => {
  const store = new InMemoryOutboxStore([{ aggregateId: 'ledger-1', eventType: 'deposit.credited', id: 'event-1', payload: { amount_atoms: '1000000' } }]);
  const sent: string[] = [];
  const publisher = new OutboxPublisher(store, {
    publish: async (event) => {
      if (sent.length === 0) throw new Error('broker temporarily unavailable');
      sent.push(event.id);
    },
  });

  assert.deepEqual(await publisher.publishBatch('publisher-1', 10), { failed: 1, published: 0 });
  assert.equal(store.event('event-1')?.publishedAt, undefined);
  assert.equal(store.event('event-1')?.attempts, 1);

  sent.push('recovered');
  assert.deepEqual(await publisher.publishBatch('publisher-1', 10), { failed: 0, published: 1 });
  assert.equal(store.event('event-1')?.publishedAt instanceof Date, true);
  assert.deepEqual(sent, ['recovered', 'event-1']);
});
