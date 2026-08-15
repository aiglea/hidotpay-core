export type ReconciliationTemporalActivities = {
  reconcileLedger(input: { ledgerTransactionId: string }): Promise<{ ledgerTransactionId: string; status: 'applied' | 'queued' }>;
};

export type TemporalActivityWorker = {
  run(): Promise<void>;
  shutdown(): Promise<void> | void;
};

export type TemporalActivityWorkerFactory = {
  create(input: {
    activities: ReconciliationTemporalActivities;
    connection: unknown;
    namespace: string;
    taskQueue: string;
  }): Promise<TemporalActivityWorker>;
};

/** Creates an activity-only worker; it cannot execute public API handlers. */
export async function createReconciliationTemporalWorker(input: {
  activities: ReconciliationTemporalActivities;
  connection: unknown;
  create: TemporalActivityWorkerFactory['create'];
  namespace: string;
  taskQueue: string;
}): Promise<TemporalActivityWorker> {
  if (!input.connection) throw new Error('Temporal connection is required');
  if (!/^[A-Za-z0-9._-]{3,249}$/.test(input.namespace)) throw new Error('Temporal namespace is invalid');
  if (!/^[A-Za-z0-9._-]{3,249}$/.test(input.taskQueue)) throw new Error('Temporal task queue is invalid');
  return input.create({
    activities: input.activities,
    connection: input.connection,
    namespace: input.namespace,
    taskQueue: input.taskQueue,
  });
}
