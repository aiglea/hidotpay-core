import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { Pool } from 'pg';

import { applyMigrations } from '../../ledger-api/src/migrations.js';
import { PostgresOutboxStore } from '../src/postgres-outbox-store.js';

const databaseUrl = process.env.HIDOTPAY_TEST_DATABASE_URL;

test('Postgres outbox leases an event to one publisher and retains it after a broker error', { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const eventId = randomUUID();
  try {
    await applyMigrations(pool);
    await pool.query(
      `INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, created_at)
       VALUES ($1, 'deposit.credited', 'deposit_receipt', $2, '{}'::JSONB, '1970-01-01T00:00:00Z')`,
      [eventId, randomUUID()],
    );
    const store = new PostgresOutboxStore(pool, () => new Date('2026-08-14T12:00:00.000Z'));
    const first = await store.claim('publisher-a', 1);
    assert.equal(first.map((event) => event.id).includes(eventId), true);
    assert.equal((await store.claim('publisher-b', 1)).map((event) => event.id).includes(eventId), false);
    await store.release(eventId, 'publisher-a', 'broker unavailable');
    const second = await store.claim('publisher-b', 1);
    assert.equal(second.map((event) => event.id).includes(eventId), true);
    await store.markPublished(eventId, 'publisher-b');
    assert.equal((await store.claim('publisher-c', 1)).map((event) => event.id).includes(eventId), false);
  } finally {
    await pool.end();
  }
});
