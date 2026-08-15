import { Connection, WorkflowClient } from '@temporalio/client';
import { once } from 'node:events';

import { loadWorkflowDispatcherConfig } from '../config.js';
import { createKafkaJsWorkflowConsumer } from '../kafka-consumer.js';
import { RedpandaWorkflowDispatcher } from '../redpanda-dispatcher.js';
import { createRuntimeHealthServer } from '../runtime-health.js';
import { TemporalWorkflowStarter } from '../temporal-starter.js';

const config = loadWorkflowDispatcherConfig(process.env);
const connection = await Connection.connect({ address: config.temporalAddress });
const client = new WorkflowClient({ connection, namespace: config.temporalNamespace });
const starter = new TemporalWorkflowStarter(client, config.taskQueue);
const dispatcher = new RedpandaWorkflowDispatcher(starter);
const health = createRuntimeHealthServer();
const consumer = createKafkaJsWorkflowConsumer({
  brokers: config.brokers,
  groupId: config.groupId,
  topic: config.topic,
}, dispatcher);

health.server.listen(config.healthPort, config.healthHost);
await once(health.server, 'listening');

let stopping = false;
const stop = async (): Promise<void> => {
  if (stopping) return;
  stopping = true;
  health.markStopping();
  await consumer.close();
  await new Promise<void>((resolve, reject) => health.server.close((error) => error ? reject(error) : resolve()));
  await connection.close();
};

process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });

try {
  await consumer.start();
  health.markReady();
  process.stdout.write('workflow event dispatcher started\n');
  await new Promise<void>((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
} finally {
  await stop();
}
