import assert from 'node:assert/strict';
import test from 'node:test';

import type { Pool } from 'pg';

import { applyMigrations } from '../src/migrations.js';

test('migration runner sends a CockroachDB column change and its data backfill as separate statements', async () => {
  const statements: string[] = [];
  const client = {
    async query(statement: string): Promise<{ rows: Array<{ checksum?: string; exists?: boolean }> }> {
      statements.push(statement);
      if (/ALTER TABLE p2p_orders ADD COLUMN(?: IF NOT EXISTS)? payment_deadline_at/i.test(statement) && statement.includes('UPDATE p2p_orders')) {
        throw new Error('column "payment_deadline_at" is being backfilled');
      }
      if (statement.includes('information_schema.tables')) return { rows: [{ exists: true }] };
      if (statement.includes('SELECT checksum FROM schema_migrations')) return { rows: [] };
      return { rows: [] };
    },
    release(): void {},
  };
  const pool = { connect: async () => client } as unknown as Pool;

  await applyMigrations(pool);

  const deadlineAlter = statements.find((statement) => /ALTER TABLE p2p_orders ADD COLUMN(?: IF NOT EXISTS)? payment_deadline_at/i.test(statement));
  const deadlineBackfill = statements.find((statement) => statement.includes('UPDATE p2p_orders'));
  assert.ok(deadlineAlter);
  assert.ok(deadlineBackfill);
  assert.ok(!statements.includes('BEGIN'));
  assert.ok(!statements.includes('COMMIT'));
  assert.doesNotMatch(deadlineAlter, /UPDATE p2p_orders/);
  assert.doesNotMatch(deadlineBackfill, /ALTER TABLE p2p_orders ADD COLUMN(?: IF NOT EXISTS)? payment_deadline_at/i);
});
