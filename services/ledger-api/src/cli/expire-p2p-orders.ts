import { Pool } from 'pg';

import { PostgresP2POrderRepository } from '../repositories/postgres-p2p-order-repository.js';
import { runP2PPaymentExpiry } from '../services/p2p-timeout-runner.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for P2P payment expiry');
const batchValue = process.env.P2P_EXPIRY_BATCH_SIZE ?? '100';
if (!/^[1-9][0-9]{0,3}$/.test(batchValue)) throw new Error('P2P_EXPIRY_BATCH_SIZE must be between 1 and 1000');
const batchSize = Number(batchValue);

const pool = new Pool({ connectionString: databaseUrl });
try {
  const result = await runP2PPaymentExpiry(new PostgresP2POrderRepository(pool), batchSize);
  process.stdout.write(`${JSON.stringify({ service: 'hidotpay-p2p-payment-expiry', ...result })}\n`);
} finally {
  await pool.end();
}
