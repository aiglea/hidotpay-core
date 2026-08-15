import assert from 'node:assert/strict';
import test from 'node:test';

import { loadOutboxPublisherConfig } from '../src/config.js';

test('outbox publisher requires its private database and Redpanda configuration', () => {
  assert.deepEqual(loadOutboxPublisherConfig({
    DATABASE_URL: 'postgresql://publisher:secret@cockroach.internal:26257/hidotpay?sslmode=verify-full',
    KAFKA_BROKERS: 'redpanda-0.internal:9092,redpanda-1.internal:9092',
    OUTBOX_PUBLISHER_ID: 'outbox-publisher-0',
  }), {
    batchSize: 100,
    brokers: ['redpanda-0.internal:9092', 'redpanda-1.internal:9092'],
    databaseUrl: 'postgresql://publisher:secret@cockroach.internal:26257/hidotpay?sslmode=verify-full',
    healthHost: '0.0.0.0',
    healthPort: 8080,
    pollIntervalMs: 1000,
    publisherId: 'outbox-publisher-0',
    topic: 'hidotpay.events.v1',
  });
  assert.throws(() => loadOutboxPublisherConfig({
    DATABASE_URL: 'postgresql://publisher:secret@cockroach.internal:26257/hidotpay',
    KAFKA_BROKERS: 'not a broker',
  }), /KAFKA_BROKERS is invalid/);
  assert.throws(() => loadOutboxPublisherConfig({
    DATABASE_URL: 'postgresql://publisher:secret@cockroach.internal:26257/hidotpay',
    KAFKA_BROKERS: 'redpanda-0.internal:9092',
    OUTBOX_POLL_INTERVAL_MS: '99',
  }), /OUTBOX_POLL_INTERVAL_MS must be between 100 and 60000/);
});
