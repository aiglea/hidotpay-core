import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import test from 'node:test';

import { createOutboxPublisherHealthServer } from '../src/runtime-health.js';

test('outbox publisher is live before startup and ready only after Redpanda is reachable', async () => {
  const health = createOutboxPublisherHealthServer();
  health.server.listen(0, '127.0.0.1');
  await once(health.server, 'listening');
  const address = health.server.address();
  assert.ok(address && typeof address !== 'string');

  try {
    assert.equal((await get(address.port, '/health/live')).statusCode, 200);
    assert.equal((await get(address.port, '/health/ready')).statusCode, 503);
    health.markReady();
    assert.equal((await get(address.port, '/health/ready')).statusCode, 200);
    health.markStopping();
    assert.equal((await get(address.port, '/health/live')).statusCode, 503);
  } finally {
    await new Promise<void>((resolve, reject) => health.server.close((error) => error ? reject(error) : resolve()));
  }
});

function get(port: number, path: string): Promise<{ statusCode: number }> {
  return new Promise((resolve, reject) => {
    const operation = request({ host: '127.0.0.1', path, port }, (response) => {
      response.resume();
      response.once('end', () => resolve({ statusCode: response.statusCode ?? 0 }));
    });
    operation.once('error', reject);
    operation.end();
  });
}
