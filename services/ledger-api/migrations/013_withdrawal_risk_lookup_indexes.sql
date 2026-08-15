-- Supports the risk checks executed inside the same serializable withdrawal
-- transaction. No financial rows are rewritten or removed.
CREATE INDEX IF NOT EXISTS withdrawal_fee_quotes_active_lookup_idx
  ON withdrawal_fee_quotes (id, user_id, network, asset_code, consumed_at, expires_at);

CREATE INDEX IF NOT EXISTS withdrawal_address_whitelist_lookup_idx
  ON withdrawal_address_whitelist (user_id, network, address, status, added_at);

CREATE INDEX IF NOT EXISTS withdrawal_requests_daily_risk_idx
  ON withdrawal_requests (requested_by, asset_code, created_at, status);
