-- Execute once using a CockroachDB administrator after migration 008 succeeds.
-- Hyperdrive uses hidotpay_ledger_runtime; the scanner cannot persist cursors without these grants.
GRANT SELECT, INSERT, UPDATE ON TABLE
  chain_scan_cursors,
  chain_deposit_observations
TO hidotpay_ledger_runtime;
