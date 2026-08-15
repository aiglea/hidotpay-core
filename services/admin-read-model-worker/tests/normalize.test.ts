import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeProjectionRows } from '../src/normalize.js';

test('wallet address projection accepts only documented fields', () => {
  const records = normalizeProjectionRows('wallet_addresses', [{
    id: '7f5e4cc6-cbde-4e0b-bf5f-1fb600a6c9e1',
    address: '0x1234',
    created_at: '2026-08-15T00:00:00.000Z',
    network: 'ethereum',
    private_key: 'must-not-leak',
    status: 'active',
  }]);

  assert.deepEqual(records, [{
    address: '0x1234',
    network: 'ethereum',
    source_id: '7f5e4cc6-cbde-4e0b-bf5f-1fb600a6c9e1',
    source_updated_at: '2026-08-15T00:00:00.000Z',
    status: 'active',
  }]);
});

test('ledger transaction projection converts a database timestamp to an ISO string', () => {
  const records = normalizeProjectionRows('ledger_transactions', [{
    actor_id: 'd3f5b280-5fcb-4ad0-bb5b-8dc2dfa06fae',
    updated_at: new Date('2026-08-15T00:00:00.000Z'),
    id: '7f5e4cc6-cbde-4e0b-bf5f-1fb600a6c9e1',
    status: 'committed',
    transaction_type: 'internal_transfer',
  }]);

  assert.equal(records[0].source_updated_at, '2026-08-15T00:00:00.000Z');
});
