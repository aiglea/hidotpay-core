import assert from 'node:assert/strict';
import test from 'node:test';

import { runP2PPaymentExpiry } from '../src/services/p2p-timeout-runner.js';

test('P2P payment timeout runner invokes only the repository expiry operation with a bounded batch', async () => {
  const limits: number[] = [];
  const result = await runP2PPaymentExpiry({
    expireDue: async (limit) => {
      limits.push(limit);
      return ['order-001', 'order-002'];
    },
  }, 25);
  assert.deepEqual(limits, [25]);
  assert.deepEqual(result, { expiredOrderIds: ['order-001', 'order-002'] });
});

test('P2P payment timeout runner rejects an unbounded batch before touching the ledger', async () => {
  await assert.rejects(
    () => runP2PPaymentExpiry({ expireDue: async () => { throw new Error('must not run'); } }, 0),
    /P2P expiry batch size must be between 1 and 1000/,
  );
});
