import assert from 'node:assert/strict';
import test from 'node:test';

import { PostgresAdminProjectionSource } from '../src/source-reader.js';

test('source reader only queries the approved administration view and fields', async () => {
  const queries: string[] = [];
  const source = new PostgresAdminProjectionSource({
    async query(sql: string) {
      queries.push(sql);
      return { rows: [] };
    },
  });

  await source.list('wallet_addresses');

  assert.equal(queries.length, 1);
  assert.match(queries[0], /FROM admin_wallet_addresses/i);
  assert.match(queries[0], /SELECT id, address, network, status, created_at/i);
  assert.doesNotMatch(queries[0], /FROM\s+wallet_addresses\b/i);
  assert.doesNotMatch(queries[0], /private_key|signer|seed/i);
});
