import assert from 'node:assert/strict';
import test from 'node:test';

import { loadConfig } from '../src/config.js';

test('any running API requires Logto audience and database URL', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://example' }),
    /running API requires DATABASE_URL, Logto configuration, and WITHDRAWAL_FEE_SCHEDULE/,
  );
  assert.throws(
    () => loadConfig({ NODE_ENV: 'development', DATABASE_URL: 'postgres://example' }),
    /running API requires DATABASE_URL, Logto configuration, and WITHDRAWAL_FEE_SCHEDULE/,
  );
});

test('test environment accepts no database URL for pure unit tests', () => {
  const config = loadConfig({ NODE_ENV: 'test' });
  assert.equal(config.environment, 'test');
  assert.equal(config.withdrawalsEnabled, false);
});

test('P2P payment window defaults safely and rejects an unsafe timeout', () => {
  assert.equal(loadConfig({ NODE_ENV: 'test' }).p2pPaymentTimeoutMs, 900_000);
  assert.equal(loadConfig({ NODE_ENV: 'test', P2P_PAYMENT_TIMEOUT_SECONDS: '120' }).p2pPaymentTimeoutMs, 120_000);
  assert.throws(
    () => loadConfig({ NODE_ENV: 'test', P2P_PAYMENT_TIMEOUT_SECONDS: '30' }),
    /P2P_PAYMENT_TIMEOUT_SECONDS must be between 60 and 86400/,
  );
});

test('external withdrawals stay disabled unless the deployment explicitly enables them', () => {
  const base = {
    NODE_ENV: 'production', DATABASE_URL: 'postgres://example', LOGTO_AUDIENCE: 'https://api.example.invalid', LOGTO_ISSUER: 'https://issuer.example.invalid/oidc', SIGNER_DERIVATION_URL: 'https://signer.internal.example/v1/deposit-addresses', SIGNER_SERVICE_TOKEN: 'test-signer-service-token', WITHDRAWAL_FEE_SCHEDULE: '{"ethereum:USDT":"10000"}',
  };
  assert.equal(loadConfig(base).withdrawalsEnabled, false);
  assert.throws(
    () => loadConfig({ ...base, WITHDRAWALS_ENABLED: 'true' }),
    /enabling withdrawals requires explicit withdrawal risk limits and whitelist cooldown/,
  );
  assert.equal(loadConfig({
    ...base,
    WITHDRAWALS_ENABLED: 'true',
    WITHDRAWAL_DAILY_LIMIT_ATOMS: '5000000',
    WITHDRAWAL_MAX_PER_WITHDRAWAL_ATOMS: '2000000',
    WITHDRAWAL_WHITELIST_COOLDOWN_SECONDS: '86400',
  }).withdrawalsEnabled, true);
  assert.throws(() => loadConfig({ ...base, WITHDRAWALS_ENABLED: 'yes' }), /WITHDRAWALS_ENABLED must be true or false/);
});

test('withdrawal risk limits use atom strings and reject malformed deployment values', () => {
  const base = {
    NODE_ENV: 'production', DATABASE_URL: 'postgres://example', LOGTO_AUDIENCE: 'https://api.example.invalid', LOGTO_ISSUER: 'https://issuer.example.invalid/oidc', SIGNER_DERIVATION_URL: 'https://signer.internal.example/v1/deposit-addresses', SIGNER_SERVICE_TOKEN: 'test-signer-service-token', WITHDRAWAL_FEE_SCHEDULE: '{"ethereum:USDT":"10000"}',
  };
  const controls = loadConfig({
    ...base,
    WITHDRAWAL_DAILY_LIMIT_ATOMS: '5000000',
    WITHDRAWAL_MAX_PER_WITHDRAWAL_ATOMS: '2000000',
    WITHDRAWAL_WHITELIST_COOLDOWN_SECONDS: '3600',
  }).withdrawalRiskControls;
  assert.deepEqual(controls, { dailyLimitAtoms: '5000000', maxPerWithdrawalAtoms: '2000000', whitelistCooldownMs: 3_600_000 });
  assert.throws(() => loadConfig({ ...base, WITHDRAWAL_DAILY_LIMIT_ATOMS: '1.5' }), /WITHDRAWAL_DAILY_LIMIT_ATOMS must be a positive atom amount/);
  assert.throws(() => loadConfig({ ...base, WITHDRAWAL_WHITELIST_COOLDOWN_SECONDS: '-1' }), /WITHDRAWAL_WHITELIST_COOLDOWN_SECONDS must be between 0 and 31536000/);
});

test('production listens on all network interfaces unless HOST is explicitly set', () => {
  const required = {
    DATABASE_URL: 'postgres://example',
    LOGTO_AUDIENCE: 'https://api.example.invalid',
    LOGTO_ISSUER: 'https://issuer.example.invalid/oidc',
    SIGNER_DERIVATION_URL: 'https://signer.internal.example/v1/deposit-addresses',
    SIGNER_SERVICE_TOKEN: 'test-signer-service-token',
    WITHDRAWAL_FEE_SCHEDULE: '{"ethereum:USDT":"10000"}',
  };
  const config = loadConfig({
    NODE_ENV: 'production', ...required,
  });
  assert.equal(config.host, '0.0.0.0');
  assert.equal(loadConfig({
    NODE_ENV: 'development', HOST: '127.0.0.2', ...required,
  }).host, '127.0.0.2');
});

test('a running API refuses to start without a private signer address endpoint and service credential', () => {
  const base = {
    NODE_ENV: 'production', DATABASE_URL: 'postgres://example', LOGTO_AUDIENCE: 'https://api.example.invalid', LOGTO_ISSUER: 'https://issuer.example.invalid/oidc', WITHDRAWAL_FEE_SCHEDULE: '{"ethereum:USDT":"10000"}',
  };
  assert.throws(() => loadConfig(base), /running API requires a private signer derivation endpoint and service credential/);
  assert.throws(() => loadConfig({ ...base, SIGNER_DERIVATION_URL: 'http://signer.internal.example' }), /SIGNER_DERIVATION_URL must use https/);
});
