import { Pool } from 'pg';

import { loadConfig } from '../config.js';
import { createReadModelRuntime } from '../runtime.js';

const config = loadConfig(process.env);
const pool = new Pool({ connectionString: config.sourceDatabaseUrl });

try {
  const result = await createReadModelRuntime(config, pool).runOnce();
  process.stdout.write(`${JSON.stringify({ service: 'hidotpay-admin-read-model-worker', ...result })}\n`);
} finally {
  await pool.end();
}
