-- Execute once using a CockroachDB administrator after migration 012 succeeds.
-- The user must already have been created with a secret-manager generated password.
GRANT SELECT ON TABLE
  admin_wallet_addresses,
  admin_deposit_receipts,
  admin_withdrawal_requests,
  admin_ledger_transactions,
  admin_ledger_postings,
  admin_withdrawal_risk_decisions,
  admin_p2p_orders,
  admin_p2p_disputes,
  admin_p2p_payment_methods
TO hidotpay_nocobase_reader;
