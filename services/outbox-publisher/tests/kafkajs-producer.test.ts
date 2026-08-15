import assert from 'node:assert/strict';
import test from 'node:test';

import { createManagedKafkaProducer } from '../src/kafkajs-producer.js';

test('managed Kafka producer connects once, disables auto topic creation, and disconnects cleanly', async () => {
  const calls: Array<{ name: string; value?: unknown }> = [];
  const managed = createManagedKafkaProducer({
    brokers: ['127.0.0.1:19092'], clientId: 'hidotpay-outbox-publisher', topic: 'hidotpay.events.v1',
  }, {
    producer(options) {
      calls.push({ name: 'producer', value: options });
      return {
        async connect() { calls.push({ name: 'connect' }); },
        async disconnect() { calls.push({ name: 'disconnect' }); },
        async send(input) { calls.push({ name: 'send', value: input }); },
      };
    },
  });

  await managed.publish({ aggregateId: 'a', attempts: 0, eventType: 'internal_transfer.committed', id: 'event-1', payload: {} });
  await managed.publish({ aggregateId: 'b', attempts: 0, eventType: 'withdrawal.approved', id: 'event-2', payload: {} });
  await managed.close();

  assert.deepEqual(calls.map((call) => call.name), ['producer', 'connect', 'send', 'send', 'disconnect']);
  assert.deepEqual(calls[0]?.value, { allowAutoTopicCreation: false, idempotent: true, maxInFlightRequests: 1 });
});

test('managed Kafka producer can establish the broker connection before the outbox has events', async () => {
  const calls: string[] = [];
  const managed = createManagedKafkaProducer({
    brokers: ['127.0.0.1:19092'], clientId: 'hidotpay-outbox-publisher', topic: 'hidotpay.events.v1',
  }, {
    producer() {
      return {
        async connect() { calls.push('connect'); },
        async disconnect() { calls.push('disconnect'); },
        async send() { calls.push('send'); },
      };
    },
  });

  await managed.connect();
  await managed.close();

  assert.deepEqual(calls, ['connect', 'disconnect']);
});
