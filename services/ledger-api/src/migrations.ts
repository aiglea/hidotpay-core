import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Pool } from 'pg';

const migrationsDirectory = fileURLToPath(new URL('../migrations', import.meta.url));

type Migration = {
  checksum: string;
  sql: string;
  version: string;
};

async function loadMigrations(): Promise<Migration[]> {
  const entries = await readdir(migrationsDirectory);
  const names = entries.filter((entry) => /^\d+_[a-z0-9_]+\.sql$/.test(entry)).sort();
  return Promise.all(names.map(async (name) => {
    const sql = await readFile(join(migrationsDirectory, name), 'utf8');
    return {
      checksum: createHash('sha256').update(sql).digest('hex'),
      sql,
      version: name,
    };
  }));
}

export async function applyMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version STRING PRIMARY KEY,
        checksum STRING NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    for (const migration of await loadMigrations()) {
      const existing = await client.query<{ checksum: string }>(
        'SELECT checksum FROM schema_migrations WHERE version = $1',
        [migration.version],
      );
      const row = existing.rows[0];
      if (row) {
        if (row.checksum !== migration.checksum) {
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
