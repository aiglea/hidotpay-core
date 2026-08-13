import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const migrationPath = fileURLToPath(new URL('../migrations/001_financial_core.sql', import.meta.url));
const settlementMigrationPath = fileURLToPath(new URL('../migrations/002_allow_platform_settlement_offsets.sql', import.meta.url));
const chainAssetMigrationPath = fileURLToPath(new URL('../migrations/003_chain_asset_policy.sql', import.meta.url));
const legacyBalanceMigrationPath = fileURLToPath(new URL('../migrations/005_drop_legacy_balance_check.sql', import.meta.url));

test('financial migration contains no destructive DDL and creates the immutable journal', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  assert.doesNotMatch(sql, /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i);
  assert.match(sql, /CREATE TABLE ledger_transactions/);
  assert.match(sql, /CREATE TABLE ledger_postings/);
  assert.match(sql, /CREATE TABLE idempotency_records/);
  assert.match(sql, /DECIMAL\(39,\s*0\)/);
  assert.match(sql, /CREATE TABLE schema_migrations/);
});

test('settlement migration only relaxes the platform offset constraint', () => {
  const sql = readFileSync(settlementMigrationPath, 'utf8');
  assert.doesNotMatch(sql, /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i);
  assert.match(sql, /DROP CONSTRAINT IF EXISTS account_balances_balance_atoms_check/i);
});

test('chain asset policy records a controlled finality threshold', () => {
  const sql = readFileSync(chainAssetMigrationPath, 'utf8');
  assert.doesNotMatch(sql, /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i);
  assert.match(sql, /CREATE TABLE chain_assets/);
  assert.match(sql, /minimum_confirmations/);
});

test('legacy balance migration only removes the old generated check constraint', () => {
  const sql = readFileSync(legacyBalanceMigrationPath, 'utf8');
  assert.doesNotMatch(sql, /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i);
  assert.match(sql, /DROP CONSTRAINT IF EXISTS check_balance_atoms/i);
});
