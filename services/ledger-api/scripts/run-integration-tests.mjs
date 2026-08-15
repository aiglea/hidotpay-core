import { spawnSync } from 'node:child_process';

const testDatabaseUrl = process.env.HIDOTPAY_TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  process.stdout.write('HIDOTPAY_TEST_DATABASE_URL is not configured; integration tests skipped.\n');
  process.exit(0);
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

const testCases = [
  { file: 'tests/integration/transfer-repository.test.ts', name: 'CockroachDB transfer is balanced and idempotent' },
  { file: 'tests/integration/transfer-repository.test.ts', name: 'CockroachDB deposit and withdrawal lifecycle preserves a balanced ledger' },
  { file: 'tests/integration/transfer-repository.test.ts', name: 'CockroachDB serializes competing withdrawals so a user balance never becomes negative' },
  { file: 'tests/integration/wallet-addresses.test.ts', name: 'a user receives one persistent independent address per network, even under concurrent allocation' },
  { file: 'tests/integration/wallet-transactions.test.ts', name: 'CockroachDB wallet transaction history is account-isolated and keyset-paginated' },
  { file: 'tests/integration/p2p-order-repository.test.ts', name: 'CockroachDB P2P order locks, releases, and balances each order exactly once' },
  { file: 'tests/integration/p2p-order-repository.test.ts', name: 'CockroachDB timeout refunds only an overdue unpaid P2P order once' },
];

for (const testCase of testCases) {
  process.stdout.write(`running integration case: ${testCase.name}\n`);
  const result = spawnSync(process.execPath, [
    '--import', 'tsx', '--test', '--test-concurrency=1', '--test-name-pattern', `^${testCase.name}$`,
    testCase.file,
  ], { stdio: 'inherit' });
  process.stdout.write(`finished integration case: ${testCase.name} (status ${String(result.status)})\n`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
