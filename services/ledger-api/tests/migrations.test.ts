import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const migrationPath = fileURLToPath(new URL('../migrations/001_financial_core.sql', import.meta.url));

test('financial migration contains no destructive DDL and creates the immutable journal', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  assert.doesNotMatch(sql, /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i);
  assert.match(sql, /CREATE TABLE ledger_transactions/);
  assert.match(sql, /CREATE TABLE ledger_postings/);
  assert.match(sql, /CREATE TABLE idempotency_records/);
  assert.match(sql, /DECIMAL\(39,\s*0\)/);
});
