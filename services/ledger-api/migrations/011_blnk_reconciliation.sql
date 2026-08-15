ALTER TABLE deposit_receipts ADD COLUMN IF NOT EXISTS blnk_reference STRING;
ALTER TABLE deposit_receipts ADD COLUMN IF NOT EXISTS blnk_transaction_id STRING;
ALTER TABLE deposit_receipts ADD COLUMN IF NOT EXISTS blnk_status STRING;
ALTER TABLE deposit_receipts ADD COLUMN IF NOT EXISTS blnk_reconciled_at TIMESTAMPTZ;
ALTER TABLE deposit_receipts ADD COLUMN IF NOT EXISTS blnk_last_error STRING;
ALTER TABLE deposit_receipts ADD COLUMN IF NOT EXISTS blnk_attempts INT8 NOT NULL DEFAULT 0 CHECK (blnk_attempts >= 0);
ALTER TABLE deposit_receipts ADD COLUMN IF NOT EXISTS blnk_lease_owner STRING;
ALTER TABLE deposit_receipts ADD COLUMN IF NOT EXISTS blnk_lease_until TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS deposit_receipts_blnk_reference_idx ON deposit_receipts (blnk_reference) WHERE blnk_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS deposit_receipts_blnk_reconciliation_idx ON deposit_receipts (blnk_reconciled_at, blnk_lease_until, created_at);
