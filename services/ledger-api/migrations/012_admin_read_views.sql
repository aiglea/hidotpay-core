CREATE VIEW admin_wallet_addresses AS
SELECT
  id,
  owner_id,
  account_id,
  network,
  address,
  status,
  created_at
FROM wallet_addresses;

CREATE VIEW admin_deposit_receipts AS
SELECT
  id,
  network,
  transaction_hash,
  output_index,
  asset_code,
  destination_account_id,
  amount_atoms,
  confirmation_count,
  credited_transaction_id,
  blnk_transaction_id,
  blnk_status,
  blnk_reconciled_at,
  blnk_attempts,
  created_at
FROM deposit_receipts;

CREATE VIEW admin_withdrawal_requests AS
SELECT
  id,
  account_id,
  frozen_account_id,
  asset_code,
  amount_atoms,
  fee_atoms,
  network,
  destination_address,
  status,
  requested_by,
  reviewed_by,
  chain_transaction_hash,
  failure_reason,
  created_at,
  updated_at
FROM withdrawal_requests;

CREATE VIEW admin_ledger_transactions AS
SELECT
  id,
  transaction_type,
  status,
  actor_id,
  created_at
FROM ledger_transactions;

CREATE VIEW admin_ledger_postings AS
SELECT
  id,
  transaction_id,
  account_id,
  asset_code,
  amount_atoms,
  created_at
FROM ledger_postings;

CREATE VIEW admin_withdrawal_risk_decisions AS
SELECT
  id,
  withdrawal_id,
  decision,
  rule_code,
  created_at
FROM withdrawal_risk_decisions;
