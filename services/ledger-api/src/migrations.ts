import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Pool } from 'pg';

const migrationsDirectory = fileURLToPath(new URL('../migrations', import.meta.url));

type Migration = {
  checksum: string;
  legacyChecksums: string[];
  sql: string;
  version: string;
};

const originalBlnkReconciliationMigration = [
  'ALTER TABLE deposit_receipts ADD COLUMN blnk_reference STRING;',
  'ALTER TABLE deposit_receipts ADD COLUMN blnk_transaction_id STRING;',
  'ALTER TABLE deposit_receipts ADD COLUMN blnk_status STRING;',
  'ALTER TABLE deposit_receipts ADD COLUMN blnk_reconciled_at TIMESTAMPTZ;',
  'ALTER TABLE deposit_receipts ADD COLUMN blnk_last_error STRING;',
  'ALTER TABLE deposit_receipts ADD COLUMN blnk_attempts INT8 NOT NULL DEFAULT 0 CHECK (blnk_attempts >= 0);',
  'ALTER TABLE deposit_receipts ADD COLUMN blnk_lease_owner STRING;',
  'ALTER TABLE deposit_receipts ADD COLUMN blnk_lease_until TIMESTAMPTZ;',
  '',
  'CREATE UNIQUE INDEX deposit_receipts_blnk_reference_idx ON deposit_receipts (blnk_reference) WHERE blnk_reference IS NOT NULL;',
  'CREATE INDEX deposit_receipts_blnk_reconciliation_idx ON deposit_receipts (blnk_reconciled_at, blnk_lease_until, created_at);',
  '',
].join('\n');

const originalP2PPaymentTimeoutMigration = [
  '-- Payment windows are persisted once, at order creation.  The timeout worker',
  '-- may refund only orders which remain in awaiting_payment after this deadline.',
  'ALTER TABLE p2p_orders ADD COLUMN payment_deadline_at TIMESTAMPTZ;',
  '',
  'UPDATE p2p_orders',
  "   SET payment_deadline_at = created_at + INTERVAL '15 minutes'",
  ' WHERE payment_deadline_at IS NULL;',
  '',
  'ALTER TABLE p2p_orders ALTER COLUMN payment_deadline_at SET NOT NULL;',
  '',
  'CREATE INDEX p2p_orders_payment_deadline_idx',
  '  ON p2p_orders (payment_deadline_at)',
  "  WHERE status = 'awaiting_payment';",
  '',
  'CREATE OR REPLACE VIEW admin_p2p_orders AS',
  'SELECT id, ad_id, buyer_id, seller_id, asset_code, amount_atoms, fiat_currency, price_atoms,',
  '       payment_method_code, status, payment_deadline_at, dispute_opened_by, released_by,',
  '       cancelled_by, created_at, updated_at',
  'FROM p2p_orders;',
  '',
].join('\n');

export function legacyChecksumsFor(name: string): string[] {
  if (name === '011_blnk_reconciliation.sql') {
    return [createHash('sha256').update(originalBlnkReconciliationMigration).digest('hex')];
  }
  if (name === '015_p2p_payment_timeout.sql') {
    return [createHash('sha256').update(originalP2PPaymentTimeoutMigration).digest('hex')];
  }
  return [];
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let quote: "'" | '"' | null = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    const next = sql[index + 1];
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (character === quote) {
        if (next === quote) {
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (character === '-' && next === '-') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === ';') {
      const statement = sql.slice(start, index).trim();
      if (statement) statements.push(statement);
      start = index + 1;
    }
  }

  const finalStatement = sql.slice(start).trim();
  if (finalStatement) statements.push(finalStatement);
  return statements;
}

async function loadMigrations(): Promise<Migration[]> {
  const entries = await readdir(migrationsDirectory);
  const names = entries.filter((entry) => /^\d+_[a-z0-9_]+\.sql$/.test(entry)).sort();
  return Promise.all(names.map(async (name) => {
    const sql = await readFile(join(migrationsDirectory, name), 'utf8');
    const legacyChecksums = name === '001_financial_core.sql'
      ? [createHash('sha256').update(sql.replace('CREATE TABLE schema_migrations', 'CREATE TABLE IF NOT EXISTS schema_migrations')).digest('hex')]
      : legacyChecksumsFor(name);
    return {
      checksum: createHash('sha256').update(sql).digest('hex'),
      legacyChecksums,
      sql,
      version: name,
    };
  }));
}

export async function applyMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    const migrations = await loadMigrations();
    const historyExists = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name = 'schema_migrations'
      ) AS exists`,
    );
    let startAt = 0;
    if (!historyExists.rows[0]?.exists) {
      const first = migrations[0];
      if (!first) throw new Error('no migrations found');
      for (const statement of splitSqlStatements(first.sql)) {
        await client.query(statement);
      }
      await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [first.version, first.checksum]);
      startAt = 1;
    }

    for (const migration of migrations.slice(startAt)) {
      const existing = await client.query<{ checksum: string }>(
        'SELECT checksum FROM schema_migrations WHERE version = $1',
        [migration.version],
      );
      const row = existing.rows[0];
      if (row) {
        if (row.checksum !== migration.checksum && !migration.legacyChecksums.includes(row.checksum)) {
          throw new Error(`migration checksum mismatch for ${migration.version}`);
        }
        continue;
      }
      for (const statement of splitSqlStatements(migration.sql)) {
        await client.query(statement);
      }
      await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [migration.version, migration.checksum]);
    }
  } finally {
    client.release();
  }
}
