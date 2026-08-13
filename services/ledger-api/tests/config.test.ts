import assert from 'node:assert/strict';
import test from 'node:test';

import { loadConfig } from '../src/config.js';

test('production requires Logto audience and database URL', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://example' }),
    /production requires DATABASE_URL, Logto configuration, and WITHDRAWAL_FEE_SCHEDULE/,
  );
});

test('test environment accepts no database URL for pure unit tests', () => {
  assert.equal(loadConfig({ NODE_ENV: 'test' }).environment, 'test');
});

test('production listens on all network interfaces unless HOST is explicitly set', () => {
  const config = loadConfig({
    NODE_ENV: 'production', DATABASE_URL: 'postgres://example', LOGTO_AUDIENCE: 'https://api.example.invalid', LOGTO_ISSUER: 'https://issuer.example.invalid/oidc', WITHDRAWAL_FEE_SCHEDULE: '{"ethereum:USDT":"10000"}',
  });
  assert.equal(config.host, '0.0.0.0');
  assert.equal(loadConfig({ NODE_ENV: 'development', HOST: '127.0.0.2' }).host, '127.0.0.2');
});
