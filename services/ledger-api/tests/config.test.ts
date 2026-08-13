import assert from 'node:assert/strict';
import test from 'node:test';

import { loadConfig } from '../src/config.js';

test('production requires Logto audience and database URL', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://example' }),
    /production requires DATABASE_URL and LOGTO_AUDIENCE/,
  );
});

test('test environment accepts no database URL for pure unit tests', () => {
  assert.equal(loadConfig({ NODE_ENV: 'test' }).environment, 'test');
});
