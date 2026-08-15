import assert from 'node:assert/strict';
import test from 'node:test';

import { createKafkaJsWorkflowConsumer, createManagedKafkaWorkflowConsumer } from '../src/kafka-consumer.js';

test('workflow consumer connects, subscribes, dispatches a Redpanda event, then disconnects', async () => {
  const calls: Array<{ name: string; value?: unknown }> = [];
  let handler: ((input: { message: { value: Buffer | null } }) => Promise<void>) | undefined;
  const consumer = createManagedKafkaWorkflowConsumer({ brokers: ['127.0.0.1:19092'], groupId: 'hidotpay-workflows-v1', topic: 'hidotpay.events.v1' }, {
    consumer(options) {
      calls.push({ name: 'consumer', value: options });
      return {
        async connect() { calls.push({ name: 'connect' }); },
        async disconnect() { calls.push({ name: 'disconnect' }); },
        async run(input) { calls.push({ name: 'run' }); handler = input.eachMessage; },
        async subscribe(input) { calls.push({ name: 'subscribe', value: input }); },
      };
    },
  }, {
    async consume(rawMessage) { calls.push({ name: 'dispatch', value: rawMessage }); return { status: 'dispatched' as const }; },
  });

  await consumer.start();
  await handler?.({ message: { value: Buffer.from('{"event_id":"event-123"}') } });
  await consumer.close();

  assert.deepEqual(calls, [
    { name: 'consumer', value: { allowAutoTopicCreation: false, groupId: 'hidotpay-workflows-v1' } },
    { name: 'connect' },
    { name: 'subscribe', value: { fromBeginning: false, topic: 'hidotpay.events.v1' } },
    { name: 'run' },
    { name: 'dispatch', value: '{"event_id":"event-123"}' },
    { name: 'disconnect' },
  ]);
});

test('KafkaJS factory delegates to the managed consumer with a real consumer-compatible client', async () => {
  const calls: string[] = [];
  const consumer = createKafkaJsWorkflowConsumer({ brokers: ['127.0.0.1:19092'], groupId: 'hidotpay-workflows-v1', topic: 'hidotpay.events.v1' }, {
    async consume() { return { status: 'ignored' as const }; },
  }, {
    consumer() {
      return {
        async connect() { calls.push('connect'); },
        async disconnect() { calls.push('disconnect'); },
        async run() { calls.push('run'); },
        async subscribe() { calls.push('subscribe'); },
      };
    },
  });

  await consumer.start();
  await consumer.close();
  assert.deepEqual(calls, ['connect', 'subscribe', 'run', 'disconnect']);
});
