import assert from 'node:assert/strict';
import test from 'node:test';

import { loadConfig } from '../src/config.js';

test('read model worker requires separate source and NocoBase credentials', () => {
  assert.throws(() => loadConfig({}), /ADMIN_READ_MODEL_SOURCE_DATABASE_URL is required/);

  const config = loadConfig({
    ADMIN_READ_MODEL_SOURCE_DATABASE_URL: 'postgresql://hidotpay_nocobase_reader:password@example.test:26257/defaultdb?sslmode=verify-full',
    NOCOBASE_API_TOKEN: 'limited-token',
    NOCOBASE_URL: 'https://admin.example.test',
  });

  assert.equal(config.nocoBaseUrl, 'https://admin.example.test');
  assert.equal(config.sourceDatabaseUrl.startsWith('postgresql://hidotpay_nocobase_reader:'), true);
});

test('production read model worker rejects an insecure NocoBase URL', () => {
  assert.throws(() => loadConfig({
    ADMIN_READ_MODEL_SOURCE_DATABASE_URL: 'postgresql://hidotpay_nocobase_reader:password@example.test:26257/defaultdb?sslmode=verify-full',
    NODE_ENV: 'production',
    NOCOBASE_API_TOKEN: 'limited-token',
    NOCOBASE_URL: 'http://127.0.0.1:13000',
  }), /NOCOBASE_URL must use HTTPS in production/);
});
