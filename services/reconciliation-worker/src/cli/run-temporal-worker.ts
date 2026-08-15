import { NativeConnection, Worker } from '@temporalio/worker';
import { once } from 'node:events';
import { Pool } from 'pg';

import { BlnkLedgerClient, createFetchBlnk } from '../../../ledger-api/dist/integrations/blnk-ledger.js';
import { loadReconciliationTemporalConfig } from '../config.js';
import { DepositReconciliationWorker } from '../deposit-reconciliation.js';
import { PostgresDepositReconciliationStore } from '../postgres-deposit-reconciliation-store.js';
import { createReconciliationTemporalActivities } from '../temporal-activities.js';
import { createReconciliationTemporalWorker } from '../temporal-worker.js';
import { createReconciliationHealthServer } from '../runtime-health.js';

const config = loadReconciliationTemporalConfig(process.env);
const pool = new Pool({ connectionString: config.databaseUrl });
const connection = await NativeConnection.connect({ address: config.temporalAddress });
const reconciler = new DepositReconciliationWorker(
  new PostgresDepositReconciliationStore(pool, config.workerId),
  new BlnkLedgerClient(createFetchBlnk(config.blnkUrl, config.blnkKey)),
);
const worker = await createReconciliationTemporalWorker({
  activities: createReconciliationTemporalActivities(reconciler),
  connection,
  create: ({ activities, namespace, taskQueue }) => Worker.create({ activities, connection, namespace, taskQueue }),
  namespace: config.temporalNamespace,
  taskQueue: config.temporalTaskQueue,
});
const health = createReconciliationHealthServer();
health.server.listen(config.healthPort, '0.0.0.0');
await once(health.server, 'listening');

let stopping = false;
const stop = async (): Promise<void> => {
  if (stopping) return;
  stopping = true;
  health.markStopping();
  await worker.shutdown();
};

process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });

try {
  process.stdout.write('reconciliation Temporal activity worker started\n');
  const run = worker.run();
  health.markReady();
  await run;
} finally {
  await stop().catch(() => undefined);
  await new Promise<void>((resolve, reject) => health.server.close((error) => error ? reject(error) : resolve()));
  await connection.close();
  await pool.end();
}
