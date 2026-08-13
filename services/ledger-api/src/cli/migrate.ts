import { Pool } from 'pg';

import { loadConfig } from '../config.js';
import { applyMigrations } from '../migrations.js';

const config = loadConfig(process.env);
if (!config.databaseUrl) throw new Error('DATABASE_URL is required to apply migrations');

const pool = new Pool({ connectionString: config.databaseUrl });
try {
  await applyMigrations(pool);
  process.stdout.write('database migrations applied\n');
} finally {
  await pool.end();
}
