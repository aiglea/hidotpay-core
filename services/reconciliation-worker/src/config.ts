export type ReconciliationConfig = {
  batchSize: number;
  blnkKey: string;
  blnkUrl: string;
  databaseUrl: string;
  workerId: string;
};

export type ReconciliationTemporalConfig = ReconciliationConfig & {
  healthPort: number;
  temporalAddress: string;
  temporalNamespace: string;
  temporalTaskQueue: string;
};

export function loadReconciliationConfig(env: NodeJS.ProcessEnv): ReconciliationConfig {
  const databaseUrl = required(env.DATABASE_URL, 'DATABASE_URL');
  const blnkUrl = required(env.BLNK_URL, 'BLNK_URL');
  const blnkKey = required(env.BLNK_KEY, 'BLNK_KEY');
  if (!/^https?:\/\/[^/]+(?:\/.*)?$/i.test(blnkUrl)) throw new Error('BLNK_URL must be an HTTP(S) URL');
  const workerId = env.RECONCILIATION_WORKER_ID ?? `reconciler-${process.pid}`;
  if (!/^[A-Za-z0-9._:-]{3,128}$/.test(workerId)) throw new Error('RECONCILIATION_WORKER_ID is invalid');
  const batchSize = env.RECONCILIATION_BATCH_SIZE === undefined ? 100 : parseBatchSize(env.RECONCILIATION_BATCH_SIZE);
  return { batchSize, blnkKey, blnkUrl, databaseUrl, workerId };
}

export function loadReconciliationTemporalConfig(env: NodeJS.ProcessEnv): ReconciliationTemporalConfig {
  const base = loadReconciliationConfig(env);
  const temporalAddress = required(env.TEMPORAL_ADDRESS, 'TEMPORAL_ADDRESS');
  const temporalNamespace = env.TEMPORAL_NAMESPACE ?? 'default';
  const temporalTaskQueue = required(env.RECONCILIATION_TEMPORAL_TASK_QUEUE, 'RECONCILIATION_TEMPORAL_TASK_QUEUE');
  const healthPort = env.RECONCILIATION_HEALTH_PORT === undefined ? 8080 : parsePort(env.RECONCILIATION_HEALTH_PORT);
  if (!/^[A-Za-z0-9._:-]{3,253}$/.test(temporalAddress)) throw new Error('TEMPORAL_ADDRESS is invalid');
  for (const [name, value] of Object.entries({ TEMPORAL_NAMESPACE: temporalNamespace, RECONCILIATION_TEMPORAL_TASK_QUEUE: temporalTaskQueue })) {
    if (!/^[A-Za-z0-9._-]{3,249}$/.test(value)) throw new Error(`${name} is invalid`);
  }
  return { ...base, healthPort, temporalAddress, temporalNamespace, temporalTaskQueue };
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseBatchSize(value: string): number {
  if (!/^[1-9][0-9]{0,2}$/.test(value)) throw new Error('RECONCILIATION_BATCH_SIZE must be between 1 and 500');
  const result = Number(value);
  if (result > 500) throw new Error('RECONCILIATION_BATCH_SIZE must be between 1 and 500');
  return result;
}

function parsePort(value: string): number {
  if (!/^[1-9][0-9]{0,4}$/.test(value)) throw new Error('RECONCILIATION_HEALTH_PORT is invalid');
  const port = Number(value);
  if (port > 65535) throw new Error('RECONCILIATION_HEALTH_PORT is invalid');
  return port;
}
