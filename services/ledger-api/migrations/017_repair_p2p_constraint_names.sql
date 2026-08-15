-- CockroachDB assigned the original unnamed checks the generated names below.
-- Migration 014 used descriptive names, so both constraints could coexist and
-- the legacy check would still reject P2P escrow accounts and transactions.
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS check_account_kind;
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_account_kind_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_account_kind_check CHECK (account_kind IN (
  'user_available', 'user_frozen', 'p2p_escrow', 'platform_treasury', 'platform_settlement'
));

ALTER TABLE ledger_transactions DROP CONSTRAINT IF EXISTS check_transaction_type;
ALTER TABLE ledger_transactions DROP CONSTRAINT IF EXISTS ledger_transactions_transaction_type_check;
ALTER TABLE ledger_transactions ADD CONSTRAINT ledger_transactions_transaction_type_check CHECK (transaction_type IN (
  'deposit_credit', 'internal_transfer', 'p2p_escrow_lock', 'p2p_escrow_refund', 'p2p_escrow_release',
  'withdrawal_freeze', 'withdrawal_release', 'withdrawal_settle'
));
