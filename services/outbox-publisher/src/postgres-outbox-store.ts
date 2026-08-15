import type { Pool, PoolClient } from 'pg';

import type { OutboxEvent, OutboxStore } from './publisher.js';

export class PostgresOutboxStore implements OutboxStore {
  public constructor(private readonly pool: Pool, private readonly now: () => Date = () => new Date()) {}

  public async claim(owner: string, limit: number): Promise<OutboxEvent[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
      const rows = await client.query<OutboxRow>(
        `SELECT id, event_type, aggregate_id, payload, attempts
         FROM outbox_events
         WHERE published_at IS NULL AND (lease_until IS NULL OR lease_until < $1)
         ORDER BY created_at ASC LIMIT $2 FOR UPDATE`,
        [this.now(), limit],
      );
      const leaseUntil = new Date(this.now().valueOf() + 60_000);
      for (const row of rows.rows) {
        await client.query('UPDATE outbox_events SET lease_owner = $2, lease_until = $3 WHERE id = $1', [row.id, owner, leaseUntil]);
      }
      await client.query('COMMIT');
      return rows.rows.map(mapEvent);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  public async markPublished(id: string, owner: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE outbox_events SET published_at = $3, lease_owner = NULL, lease_until = NULL, last_error = NULL
       WHERE id = $1 AND lease_owner = $2 AND published_at IS NULL`,
      [id, owner, this.now()],
    );
    if (result.rowCount !== 1) throw new Error('outbox event lease no longer belongs to publisher');
  }

  public async release(id: string, owner: string, error: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE outbox_events
       SET attempts = attempts + 1, last_error = $3, lease_owner = NULL, lease_until = NULL
       WHERE id = $1 AND lease_owner = $2 AND published_at IS NULL`,
      [id, owner, error],
    );
    if (result.rowCount !== 1) throw new Error('outbox event lease no longer belongs to publisher');
  }
}

type OutboxRow = { aggregate_id: string; attempts: string; event_type: string; id: string; payload: Record<string, unknown> };

function mapEvent(row: OutboxRow): OutboxEvent {
  return { aggregateId: row.aggregate_id, attempts: Number(row.attempts), eventType: row.event_type, id: row.id, payload: row.payload };
}
