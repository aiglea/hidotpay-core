import { Pool } from 'pg';

import { BlnkLedgerClient, createFetchBlnk } from '../../../ledger-api/dist/integrations/blnk-ledger.js';
import { loadReconciliationConfig } from '../config.js';
import { DepositReconciliationWorker } from '../deposit-reconciliation.js';
import { PostgresDepositReconciliationStore } from '../postgres-deposit-reconciliation-store.js';

const config = loadReconciliationConfig(process.env);
const pool = new Pool({ connectionString: config.databaseUrl });
try {
  const worker = new DepositReconciliationWorker(
    new PostgresDepositReconciliationStore(pool, config.workerId),
    new BlnkLedgerClient(createFetchBlnk(config.blnkUrl, config.blnkKey)),
  );
  const result = await worker.reconcileBatch(config.batchSize);
  process.stdout.write(`${JSON.stringify({ service: 'hidotpay-reconciliation-worker', ...result })}\n`);
} finally {
  await pool.end();
}
