import pg from 'pg';

import { applyDedicatedTestDatabasePrivileges } from '../test-database-privileges.js';

const databaseUrl = process.env.HIDOTPAY_TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('HIDOTPAY_TEST_DATABASE_URL is required.');
}

const pool = new pg.Pool({ connectionString: databaseUrl });
try {
  const client = await pool.connect();
  try {
    await applyDedicatedTestDatabasePrivileges({
      client,
      databaseUrl,
      migrationRole: process.env.HIDOTPAY_TEST_MIGRATION_ROLE ?? 'hidotpay',
      testRunnerRole: process.env.HIDOTPAY_TEST_RUNNER_ROLE ?? 'hidotpay_test_runner',
    });
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
