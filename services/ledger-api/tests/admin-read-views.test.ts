import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const migrationPath = fileURLToPath(new URL('../migrations/012_admin_read_views.sql', import.meta.url));
const p2pMigrationPath = fileURLToPath(new URL('../migrations/014_p2p_escrow.sql', import.meta.url));
const p2pPaymentMethodsMigrationPath = fileURLToPath(new URL('../migrations/016_p2p_payment_methods.sql', import.meta.url));

test('finance administration views are read-only projections that never expose signing material', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  assert.match(sql, /CREATE VIEW admin_wallet_addresses/i);
  assert.match(sql, /CREATE VIEW admin_deposit_receipts/i);
  assert.match(sql, /CREATE VIEW admin_withdrawal_requests/i);
  assert.match(sql, /CREATE VIEW admin_ledger_transactions/i);
  assert.match(sql, /CREATE VIEW admin_withdrawal_risk_decisions/i);
  assert.doesNotMatch(sql, /wallet_key_versions|signer_key_ref|private.?key|seed|mnemonic/i);
  assert.doesNotMatch(sql, /INSERT\s+INTO|UPDATE\s+\w+|DELETE\s+FROM/i);
});

test('P2P operations arrive in the low-code console only through read-only views', () => {
  const sql = readFileSync(p2pMigrationPath, 'utf8');
  const grants = readFileSync(fileURLToPath(new URL('../../../deployment/nocobase/finance-reader-grants.sql', import.meta.url)), 'utf8');
  assert.match(sql, /CREATE VIEW admin_p2p_orders/i);
  assert.match(sql, /CREATE VIEW admin_p2p_disputes/i);
  assert.match(grants, /admin_p2p_orders/i);
  assert.match(grants, /admin_p2p_disputes/i);
  assert.doesNotMatch(sql, /wallet_key_versions|signer_key_ref|private.?key|seed|mnemonic/i);
});

test('low-code finance readers can only see masked P2P payment-method projections', () => {
  const sql = readFileSync(p2pPaymentMethodsMigrationPath, 'utf8');
  const grants = readFileSync(fileURLToPath(new URL('../../../deployment/nocobase/finance-reader-grants.sql', import.meta.url)), 'utf8');
  assert.match(sql, /CREATE VIEW admin_p2p_payment_methods/i);
  assert.match(grants, /admin_p2p_payment_methods/i);
  assert.doesNotMatch(sql.match(/CREATE VIEW admin_p2p_payment_methods[\s\S]*/i)?.[0] ?? '', /encrypted_payload/i);
});
