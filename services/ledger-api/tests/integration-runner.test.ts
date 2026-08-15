import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const integrationRunnerPath = fileURLToPath(new URL('../scripts/run-integration-tests.mjs', import.meta.url));

test('the dedicated CockroachDB integration runner includes P2P and wallet-history cases and safely skips without its dedicated URL', () => {
  const source = readFileSync(integrationRunnerPath, 'utf8');

  assert.match(source, /CockroachDB P2P order locks, releases, and balances each order exactly once/);
  assert.match(source, /CockroachDB timeout refunds only an overdue unpaid P2P order once/);
  assert.match(source, /tests\/integration\/p2p-order-repository\.test\.ts/);
  assert.match(source, /CockroachDB wallet transaction history is account-isolated and keyset-paginated/);
  assert.match(source, /tests\/integration\/wallet-transactions\.test\.ts/);
  assert.match(source, /HIDOTPAY_TEST_DATABASE_URL is not configured; integration tests skipped/);
});

test('the integration runner skips when its dedicated database does not exist', async (t) => {
  const server = createServer((socket) => {
    socket.once('data', () => {
      const payload = Buffer.from('SERROR\0C3D000\0Mdatabase "hidotpay_test" does not exist\0\0');
      const response = Buffer.alloc(1 + 4 + payload.length);
      response.write('E');
      response.writeUInt32BE(4 + payload.length, 1);
      payload.copy(response, 5);
      socket.end(response);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const { DATABASE_URL: _databaseUrl, HIDOTPAY_TEST_DATABASE_URL: _testDatabaseUrl, ...environment } = process.env;
  const result = await new Promise<{ code: number | null; stderr: string; stdout: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/run-integration-tests.mjs'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      env: { ...environment, HIDOTPAY_TEST_DATABASE_URL: `postgresql://test@127.0.0.1:${address.port}/hidotpay_test` },
    });
    let stderr = '';
    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk; });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stderr, stdout }));
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /HIDOTPAY_TEST_DATABASE_URL database does not exist; integration tests skipped/);
});
