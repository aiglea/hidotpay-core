import assert from 'node:assert/strict';
import test from 'node:test';

import type { ProjectionName, ProjectionRecord } from '../src/contracts.js';
import { AdminReadModelProjector, type AdminProjectionSource, type AdminProjectionTarget } from '../src/projector.js';

const sourceId = '7f5e4cc6-cbde-4e0b-bf5f-1fb600a6c9e1';
const timestamp = '2026-08-15T00:00:00.000Z';

class StaticSourceReader implements AdminProjectionSource {
  async list(name: ProjectionName): Promise<Record<string, unknown>[]> {
    if (name !== 'wallet_addresses') return [];
    return [{ address: '0x2', created_at: timestamp, id: sourceId, network: 'ethereum', status: 'active' }];
  }
}

class InMemoryProjectionTarget implements AdminProjectionTarget {
  readonly records = new Map<string, ProjectionRecord>();
  successfulAt: string | undefined;

  async markSuccess(at: string): Promise<void> {
    this.successfulAt = at;
  }

  async upsert(name: ProjectionName, records: ProjectionRecord[]): Promise<void> {
    for (const record of records) this.records.set(`${name}:${record.source_id}`, record);
  }
}

test('a second projection run upserts the same source ID instead of creating duplicates', async () => {
  const target = new InMemoryProjectionTarget();
  const projector = new AdminReadModelProjector(new StaticSourceReader(), target, () => timestamp);

  await projector.runOnce();
  await projector.runOnce();

  assert.equal(target.records.size, 1);
  assert.equal(target.records.get(`wallet_addresses:${sourceId}`)?.address, '0x2');
  assert.equal(target.successfulAt, timestamp);
});
