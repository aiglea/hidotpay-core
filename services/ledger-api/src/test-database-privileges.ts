export type SqlClient = {
  query: (statement: string) => Promise<unknown>;
};

type TestDatabasePrivilegeOptions = {
  client: SqlClient;
  databaseUrl: string;
  migrationRole: string;
  testRunnerRole: string;
};

function quoteIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) {
    throw new Error('role identifier is invalid');
  }
  return `"${value}"`;
}

export async function applyDedicatedTestDatabasePrivileges({
  client,
  databaseUrl,
  migrationRole,
  testRunnerRole,
}: TestDatabasePrivilegeOptions): Promise<void> {
  const url = new URL(databaseUrl);
  if (url.pathname !== '/hidotpay_test') {
    throw new Error('HIDOTPAY_TEST_DATABASE_URL must target the dedicated hidotpay_test database.');
  }

  const runner = quoteIdentifier(testRunnerRole);
  const owner = quoteIdentifier(migrationRole);
  for (const statement of [
    `GRANT CREATE ON DATABASE hidotpay_test TO ${runner}`,
    `GRANT USAGE, CREATE ON SCHEMA public TO ${runner}`,
    `GRANT ALL ON ALL TABLES IN SCHEMA public TO ${runner}`,
    `GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${runner}`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public GRANT ALL ON TABLES TO ${runner}`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public GRANT ALL ON SEQUENCES TO ${runner}`,
  ]) {
    await client.query(statement);
  }
}
