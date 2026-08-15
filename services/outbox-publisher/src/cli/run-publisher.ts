import { once } from 'node:events';
import { Pool } from 'pg';

import { loadOutboxPublisherConfig } from '../config.js';
import { createKafkaJsClient, createManagedKafkaProducer } from '../kafkajs-producer.js';
import { PostgresOutboxStore } from '../postgres-outbox-store.js';
import { OutboxPublisher } from '../publisher.js';
import { createOutboxPublisherHealthServer } from '../runtime-health.js';

const config = loadOutboxPublisherConfig(process.env);
const pool = new Pool({ connectionString: config.databaseUrl });
const producer = createManagedKafkaProducer({
  brokers: config.brokers,
  clientId: `hidotpay-outbox-${config.publisherId}`,
  topic: config.topic,
}, createKafkaJsClient({ brokers: config.brokers, clientId: `hidotpay-outbox-${config.publisherId}` }));
const publisher = new OutboxPublisher(new PostgresOutboxStore(pool), producer);
const health = createOutboxPublisherHealthServer();
health.server.listen(config.healthPort, config.healthHost);
await once(health.server, 'listening');

let stopping = false;
const stop = async (): Promise<void> => {
  if (stopping) return;
  stopping = true;
  health.markStopping();
  await producer.close();
  await new Promise<void>((resolve, reject) => health.server.close((error) => error ? reject(error) : resolve()));
  await pool.end();
};

process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });

try {
  await producer.connect();
  process.stdout.write('outbox publisher started\n');
  while (!stopping) {
    try {
      const result = await publisher.publishBatch(config.publisherId, config.batchSize);
      if (result.failed > 0) health.markUnready();
      else health.markReady();
    } catch (error) {
      health.markUnready();
      process.stderr.write(`outbox publisher batch failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
    }
    await wait(config.pollIntervalMs);
  }
} finally {
  await stop().catch(() => undefined);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
