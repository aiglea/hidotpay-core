import assert from 'node:assert/strict';
import test from 'node:test';

import { loadWorkflowDispatcherConfig } from '../src/config.js';

test('workflow dispatcher requires private Redpanda and Temporal endpoints with a distinct consumer group', () => {
  assert.deepEqual(loadWorkflowDispatcherConfig({
    KAFKA_BROKERS: '127.0.0.1:19092,127.0.0.1:29092',
    TEMPORAL_ADDRESS: '127.0.0.1:17233',
    TEMPORAL_TASK_QUEUE: 'hidotpay-financial-v1',
    WORKFLOW_CONSUMER_GROUP: 'hidotpay-workflows-v1',
  }), {
    brokers: ['127.0.0.1:19092', '127.0.0.1:29092'],
    groupId: 'hidotpay-workflows-v1',
    healthHost: '0.0.0.0',
    healthPort: 8080,
    taskQueue: 'hidotpay-financial-v1',
    temporalAddress: '127.0.0.1:17233',
    temporalNamespace: 'default',
    topic: 'hidotpay.events.v1',
  });
  assert.throws(() => loadWorkflowDispatcherConfig({
    KAFKA_BROKERS: 'not a broker', TEMPORAL_ADDRESS: '127.0.0.1:17233', TEMPORAL_TASK_QUEUE: 'queue', WORKFLOW_CONSUMER_GROUP: 'group',
  }), /KAFKA_BROKERS is invalid/);
  assert.throws(() => loadWorkflowDispatcherConfig({
    KAFKA_BROKERS: '127.0.0.1:19092', TEMPORAL_ADDRESS: '127.0.0.1:17233', TEMPORAL_TASK_QUEUE: 'queue', WORKFLOW_CONSUMER_GROUP: 'group', WORKFLOW_HEALTH_PORT: '70000',
  }), /WORKFLOW_HEALTH_PORT is invalid/);
});
