import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const integrationRunnerPath = fileURLToPath(new URL('../scripts/run-integration-tests.mjs', import.meta.url));

test('the dedicated CockroachDB integration runner includes P2P escrow and overdue-payment refund cases', () => {
  const source = readFileSync(integrationRunnerPath, 'utf8');

  assert.match(source, /CockroachDB P2P order locks, releases, and balances each order exactly once/);
  assert.match(source, /CockroachDB timeout refunds only an overdue unpaid P2P order once/);
  assert.match(source, /tests\/integration\/p2p-order-repository\.test\.ts/);
});
