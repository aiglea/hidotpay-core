import assert from 'node:assert/strict';
import test from 'node:test';

import { loadReconciliationConfig, loadReconciliationTemporalConfig } from '../src/config.js';

test('reconciliation worker requires only private database and Blnk connectivity settings', () => {
  assert.throws(
    () => loadReconciliationConfig({ DATABASE_URL: 'postgres://example', BLNK_URL: 'http://127.0.0.1:5001' }),
    /BLNK_KEY is required/,
  );
  assert.deepEqual(loadReconciliationConfig({
    BLNK_KEY: 'test-key',
    BLNK_URL: 'http://127.0.0.1:5001',
    DATABASE_URL: 'postgres://example',
    RECONCILIATION_BATCH_SIZE: '25',
    RECONCILIATION_WORKER_ID: 'reconciler-zone-a-01',
  }), {
    batchSize: 25,
    blnkKey: 'test-key',
    blnkUrl: 'http://127.0.0.1:5001',
    databaseUrl: 'postgres://example',
    workerId: 'reconciler-zone-a-01',
  });
});

test('Temporal reconciliation worker requires a private Temporal endpoint and task queue', () => {
  const config = loadReconciliationTemporalConfig({
    BLNK_KEY: 'test-key',
    BLNK_URL: 'http://127.0.0.1:5001',
    DATABASE_URL: 'postgres://example',
    RECONCILIATION_TEMPORAL_TASK_QUEUE: 'hidotpay-reconciliation-v1',
    TEMPORAL_ADDRESS: 'temporal.private:7233',
    TEMPORAL_NAMESPACE: 'hidotpay',
  });
  assert.deepEqual(config, {
    batchSize: 100,
    blnkKey: 'test-key',
    blnkUrl: 'http://127.0.0.1:5001',
    databaseUrl: 'postgres://example',
    healthPort: 8080,
    temporalAddress: 'temporal.private:7233',
    temporalNamespace: 'hidotpay',
    temporalTaskQueue: 'hidotpay-reconciliation-v1',
    workerId: config.workerId,
  });
  assert.match(config.workerId, /^reconciler-[0-9]+$/);
  assert.throws(() => loadReconciliationTemporalConfig({
    BLNK_KEY: 'test-key', BLNK_URL: 'http://127.0.0.1:5001', DATABASE_URL: 'postgres://example', TEMPORAL_ADDRESS: 'temporal.private:7233',
  }), /RECONCILIATION_TEMPORAL_TASK_QUEUE is required/);
});
