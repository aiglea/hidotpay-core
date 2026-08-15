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

export function legacyChecksumsFor(name: string): string[] {
  if (name === '011_blnk_reconciliation.sql') {
    return [createHash('sha256').update(originalBlnkReconciliationMigration).digest('hex')];
  }
  return [];
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
    await client.query('BEGIN');
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
      await client.query(first.sql);
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
      await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [migration.version, migration.checksum]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
