CREATE TABLE p2p_payment_methods (
  id UUID PRIMARY KEY,
  owner_id STRING NOT NULL,
  method_code STRING NOT NULL CHECK (method_code IN ('bank_transfer', 'e_wallet')),
  currency STRING NOT NULL,
  account_holder_name STRING NOT NULL,
  masked_reference STRING NOT NULL,
  encrypted_payload STRING NOT NULL,
  encryption_key_version STRING NOT NULL,
  status STRING NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'active', 'rejected', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, method_code, currency, masked_reference)
);

CREATE INDEX p2p_payment_methods_owner_status_idx ON p2p_payment_methods (owner_id, status, created_at DESC);

CREATE VIEW admin_p2p_payment_methods AS
SELECT id, owner_id, method_code, currency, account_holder_name, masked_reference,
       encryption_key_version, status, created_at, updated_at
FROM p2p_payment_methods;
