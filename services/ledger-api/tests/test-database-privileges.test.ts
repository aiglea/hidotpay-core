import assert from 'node:assert/strict';
import test from 'node:test';

import { applyDedicatedTestDatabasePrivileges } from '../src/test-database-privileges.js';

test('test database privilege bootstrap grants existing and future financial tables only to the dedicated runner', async () => {
  const statements: string[] = [];
  const client = {
    async query(statement: string): Promise<void> {
      statements.push(statement);
    },
  };

  await applyDedicatedTestDatabasePrivileges({
    client,
    databaseUrl: 'postgresql://admin:password@example.test:26257/hidotpay_test?sslmode=verify-full',
    migrationRole: 'hidotpay',
    testRunnerRole: 'hidotpay_test_runner',
  });

  assert.deepEqual(statements, [
    'GRANT CREATE ON DATABASE hidotpay_test TO "hidotpay_test_runner"',
    'GRANT USAGE, CREATE ON SCHEMA public TO "hidotpay_test_runner"',
    'GRANT ALL ON ALL TABLES IN SCHEMA public TO "hidotpay_test_runner"',
    'GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO "hidotpay_test_runner"',
    'ALTER DEFAULT PRIVILEGES FOR ROLE "hidotpay" IN SCHEMA public GRANT ALL ON TABLES TO "hidotpay_test_runner"',
    'ALTER DEFAULT PRIVILEGES FOR ROLE "hidotpay" IN SCHEMA public GRANT ALL ON SEQUENCES TO "hidotpay_test_runner"',
  ]);
});

test('test database privilege bootstrap rejects a non-dedicated database before issuing grants', async () => {
  const statements: string[] = [];
  await assert.rejects(
    applyDedicatedTestDatabasePrivileges({
      client: { async query(statement: string): Promise<void> { statements.push(statement); } },
      databaseUrl: 'postgresql://admin:password@example.test:26257/defaultdb?sslmode=verify-full',
      migrationRole: 'hidotpay',
      testRunnerRole: 'hidotpay_test_runner',
    }),
    /must target the dedicated hidotpay_test database/,
  );
  assert.deepEqual(statements, []);
});

test('test database privilege bootstrap refuses unsafe SQL role identifiers', async () => {
  await assert.rejects(
    applyDedicatedTestDatabasePrivileges({
      client: { async query(): Promise<void> {} },
      databaseUrl: 'postgresql://admin:password@example.test:26257/hidotpay_test?sslmode=verify-full',
      migrationRole: 'hidotpay; DROP DATABASE hidotpay_test',
      testRunnerRole: 'hidotpay_test_runner',
    }),
    /role identifier is invalid/,
  );
});
