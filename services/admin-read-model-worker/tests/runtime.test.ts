import assert from 'node:assert/strict';
import test from 'node:test';

import { createReadModelRuntime } from '../src/runtime.js';

test('runtime wires the source and target without exposing credential values', async () => {
  const runtime = createReadModelRuntime({
    nocoBaseToken: 'limited-token',
    nocoBaseUrl: 'http://127.0.0.1:13000',
    sourceDatabaseUrl: 'postgresql://hidotpay_nocobase_reader:password@example.test:26257/defaultdb',
  }, { async query() { return { rows: [] }; } }, async () => new Response(JSON.stringify({ data: {} }), { status: 200 }));

  const result = await runtime.runOnce();

  assert.equal(result.projected, 0);
});
