import { spawnSync } from 'node:child_process';

const testDatabaseUrl = process.env.HIDOTPAY_TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('HIDOTPAY_TEST_DATABASE_URL is required; integration tests refuse to use DATABASE_URL.');
}
const testUrl = new URL(testDatabaseUrl);
if (testUrl.pathname !== '/hidotpay_test') {
  throw new Error('HIDOTPAY_TEST_DATABASE_URL must target the dedicated hidotpay_test database.');
}
if (process.env.DATABASE_URL) {
  const primaryUrl = new URL(process.env.DATABASE_URL);
  if (testUrl.host === primaryUrl.host && testUrl.pathname === primaryUrl.pathname) {
    throw new Error('HIDOTPAY_TEST_DATABASE_URL must not target the same database as DATABASE_URL.');
  }
}

const result = spawnSync(process.execPath, [
  '--import', 'tsx', '--test', 'tests/integration/transfer-repository.test.ts',
], { stdio: 'inherit' });
process.exit(result.status ?? 1);
