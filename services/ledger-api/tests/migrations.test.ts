import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { legacyChecksumsFor } from '../src/migrations.js';

const migrationPath = fileURLToPath(new URL('../migrations/001_financial_core.sql', import.meta.url));
const settlementMigrationPath = fileURLToPath(new URL('../migrations/002_allow_platform_settlement_offsets.sql', import.meta.url));
const chainAssetMigrationPath = fileURLToPath(new URL('../migrations/003_chain_asset_policy.sql', import.meta.url));
const legacyBalanceMigrationPath = fileURLToPath(new URL('../migrations/005_drop_legacy_balance_check.sql', import.meta.url));
const blnkReconciliationMigrationPath = fileURLToPath(new URL('../migrations/011_blnk_reconciliation.sql', import.meta.url));
const withdrawalRiskIndexesMigrationPath = fileURLToPath(new URL('../migrations/013_withdrawal_risk_lookup_indexes.sql', import.meta.url));
const p2pEscrowMigrationPath = fileURLToPath(new URL('../migrations/014_p2p_escrow.sql', import.meta.url));
const p2pTimeoutMigrationPath = fileURLToPath(new URL('../migrations/015_p2p_payment_timeout.sql', import.meta.url));
const p2pPaymentMethodsMigrationPath = fileURLToPath(new URL('../migrations/016_p2p_payment_methods.sql', import.meta.url));
const p2pConstraintRepairMigrationPath = fileURLToPath(new URL('../migrations/017_repair_p2p_constraint_names.sql', import.meta.url));
const officialTestnetDepositPolicyPath = fileURLToPath(new URL('../migrations/018_official_testnet_deposit_policy.sql', import.meta.url));
const v1ProductTestnetChainsPath = fileURLToPath(new URL('../migrations/019_v1_product_testnet_chains.sql', import.meta.url));

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

test('Blnk reconciliation migration is safe when a prior deployment created its columns', () => {
  const sql = readFileSync(blnkReconciliationMigrationPath, 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS blnk_reference/i);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS deposit_receipts_blnk_reference_idx/i);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS deposit_receipts_blnk_reconciliation_idx/i);
});

test('migration runner recognizes the original Blnk reconciliation checksum after its idempotency upgrade', () => {
  const originalSql = [
    'ALTER TABLE deposit_receipts ADD COLUMN blnk_reference STRING;',
    'ALTER TABLE deposit_receipts ADD COLUMN blnk_transaction_id STRING;',
    'ALTER TABLE deposit_receipts ADD COLUMN blnk_status STRING;',
    'ALTER TABLE deposit_receipts ADD COLUMN blnk_reconciled_at TIMESTAMPTZ;',
    'ALTER TABLE deposit_receipts ADD COLUMN blnk_last_error STRING;',
    'ALTER TABLE deposit_receipts ADD COLUMN blnk_attempts INT8 NOT NULL DEFAULT 0 CHECK (blnk_attempts >= 0);',
    'ALTER TABLE deposit_receipts ADD COLUMN blnk_lease_owner STRING;',
    'ALTER TABLE deposit_receipts ADD COLUMN blnk_lease_until TIMESTAMPTZ;',
    '',
    'CREATE UNIQUE INDEX deposit_receipts_blnk_reference_idx ON deposit_receipts (blnk_reference) WHERE blnk_reference IS NOT NULL;',
    'CREATE INDEX deposit_receipts_blnk_reconciliation_idx ON deposit_receipts (blnk_reconciled_at, blnk_lease_until, created_at);',
    '',
  ].join('\n');
  assert.deepEqual(legacyChecksumsFor('011_blnk_reconciliation.sql'), [createHash('sha256').update(originalSql).digest('hex')]);
});

test('withdrawal risk indexes are additive and cover quote, whitelist, and daily-limit lookups', () => {
  const sql = readFileSync(withdrawalRiskIndexesMigrationPath, 'utf8');
  assert.doesNotMatch(sql, /\b(DROP|DELETE|TRUNCATE)\b/i);
  assert.match(sql, /withdrawal_fee_quotes_active_lookup_idx/i);
  assert.match(sql, /withdrawal_address_whitelist_lookup_idx/i);
  assert.match(sql, /withdrawal_requests_daily_risk_idx/i);
});

test('P2P escrow migration isolates every order and gives the low-code console read-only projections', () => {
  const sql = readFileSync(p2pEscrowMigrationPath, 'utf8');
  assert.doesNotMatch(sql, /\b(DROP|DELETE|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA)\b/i);
  assert.match(sql, /p2p_escrow/);
  assert.match(sql, /ALTER TABLE ledger_transactions DROP CONSTRAINT IF EXISTS ledger_transactions_transaction_type_check/i);
  assert.match(sql, /p2p_escrow_lock/);
  assert.match(sql, /p2p_escrow_release/);
  assert.match(sql, /p2p_escrow_refund/);
  assert.match(sql, /CREATE TABLE p2p_ads/);
  assert.match(sql, /CREATE TABLE p2p_orders/);
  assert.match(sql, /CREATE TABLE p2p_disputes/);
  assert.match(sql, /CREATE VIEW admin_p2p_orders/);
  assert.match(sql, /CREATE VIEW admin_p2p_disputes/);
});

test('P2P timeout migration persists a payment deadline and makes overdue-order lookup indexed', () => {
  const sql = readFileSync(p2pTimeoutMigrationPath, 'utf8');
  assert.doesNotMatch(sql, /\b(DROP|DELETE|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA)\b/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS payment_deadline_at/i);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS p2p_orders_payment_deadline_idx/i);
  assert.match(sql, /status, dispute_opened_by, released_by,\s*cancelled_by, created_at, updated_at, payment_deadline_at/i);
  assert.match(sql, /payment_deadline_at/i);
  assert.match(sql, /p2p_orders_payment_deadline_idx/i);
});

test('migration runner recognizes the original P2P timeout checksum after its resumability upgrade', () => {
  const originalSql = [
    '-- Payment windows are persisted once, at order creation.  The timeout worker',
    '-- may refund only orders which remain in awaiting_payment after this deadline.',
    'ALTER TABLE p2p_orders ADD COLUMN payment_deadline_at TIMESTAMPTZ;',
    '',
    'UPDATE p2p_orders',
    "   SET payment_deadline_at = created_at + INTERVAL '15 minutes'",
    ' WHERE payment_deadline_at IS NULL;',
    '',
    'ALTER TABLE p2p_orders ALTER COLUMN payment_deadline_at SET NOT NULL;',
    '',
    'CREATE INDEX p2p_orders_payment_deadline_idx',
    '  ON p2p_orders (payment_deadline_at)',
    "  WHERE status = 'awaiting_payment';",
    '',
    'CREATE OR REPLACE VIEW admin_p2p_orders AS',
    'SELECT id, ad_id, buyer_id, seller_id, asset_code, amount_atoms, fiat_currency, price_atoms,',
    '       payment_method_code, status, payment_deadline_at, dispute_opened_by, released_by,',
    '       cancelled_by, created_at, updated_at',
    'FROM p2p_orders;',
    '',
  ].join('\n');
  assert.deepEqual(legacyChecksumsFor('015_p2p_payment_timeout.sql'), [createHash('sha256').update(originalSql).digest('hex')]);
});

test('P2P payment methods keep account material encrypted and expose only a masked admin projection', () => {
  const sql = readFileSync(p2pPaymentMethodsMigrationPath, 'utf8');
  assert.doesNotMatch(sql, /\b(DROP|DELETE|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA)\b/i);
  assert.match(sql, /CREATE TABLE p2p_payment_methods/i);
  assert.match(sql, /encrypted_payload/i);
  assert.match(sql, /CREATE VIEW admin_p2p_payment_methods/i);
  assert.doesNotMatch(sql.match(/CREATE VIEW admin_p2p_payment_methods[\s\S]*/i)?.[0] ?? '', /encrypted_payload/i);
});

test('P2P constraint repair removes CockroachDB generated legacy names before restoring the allowed values', () => {
  const sql = readFileSync(p2pConstraintRepairMigrationPath, 'utf8');
  assert.doesNotMatch(sql, /\b(DROP|DELETE|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA)\b/i);
  assert.match(sql, /ALTER TABLE accounts DROP CONSTRAINT IF EXISTS check_account_kind/i);
  assert.match(sql, /ALTER TABLE ledger_transactions DROP CONSTRAINT IF EXISTS check_transaction_type/i);
  assert.match(sql, /p2p_escrow/);
  assert.match(sql, /p2p_escrow_lock/);
});

test('official testnet deposit policy seeds only Sepolia and Shasta USDT', () => {
  const sql = readFileSync(officialTestnetDepositPolicyPath, 'utf8');
  assert.doesNotMatch(sql, /\b(DROP|DELETE|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA)\b/i);
  assert.match(sql, /ethereum-sepolia/);
  assert.match(sql, /tron-shasta/);
  assert.match(sql, /0x7169D38820dfd117C3FA1f22a697dBA58d90BA06/);
  assert.match(sql, /TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj/);
  assert.doesNotMatch(sql, /mainnet|0xdAC17F958D2ee523a2206206994597C13D831ec7|TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t/i);
});

test('V1 product testnet migration adds the remaining first-version chains without mainnet credit rows', () => {
  const sql = readFileSync(v1ProductTestnetChainsPath, 'utf8');
  assert.doesNotMatch(sql, /\b(DROP|DELETE|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA)\b/i);
  for (const network of [
    'bnb-testnet', 'polygon-amoy', 'arbitrum-sepolia', 'optimism-sepolia', 'base-sepolia',
    'avalanche-fuji', 'linea-sepolia', 'scroll-sepolia', 'bitcoin-testnet4', 'solana-devnet',
    'ton-testnet', 'xrpl-testnet', 'stellar-testnet',
  ]) assert.match(sql, new RegExp(network));
  assert.match(sql, /native:btc/);
  assert.match(sql, /native:xrp/);
  assert.match(sql, /4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU/);
  assert.match(sql, /GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5/);
  assert.match(sql, /'ton-testnet', 'ton', 'ton-testnet'/);
  assert.match(sql, /'xrpl-testnet', 'xrp', 'xrpl-testnet'/);
  assert.match(sql, /'stellar-testnet', 'stellar', 'stellar-testnet'/);
  assert.doesNotMatch(sql, /ethereum-mainnet|0xdAC17F958D2ee523a2206206994597C13D831ec7|TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t/);
});
