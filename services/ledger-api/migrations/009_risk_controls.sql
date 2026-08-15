CREATE TABLE withdrawal_fee_quotes (
  id UUID PRIMARY KEY,
  user_id STRING NOT NULL,
  network STRING NOT NULL,
  asset_code STRING NOT NULL REFERENCES assets (code),
  amount_atoms DECIMAL(39, 0) NOT NULL CHECK (amount_atoms > 0),
  fee_atoms DECIMAL(39, 0) NOT NULL CHECK (fee_atoms >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE withdrawal_address_whitelist (
  id UUID PRIMARY KEY,
  user_id STRING NOT NULL,
  network STRING NOT NULL,
  address STRING NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status STRING NOT NULL CHECK (status IN ('pending_cooldown', 'active', 'blocked')),
  UNIQUE (user_id, network, address)
);

CREATE TABLE withdrawal_risk_decisions (
  id UUID PRIMARY KEY,
  withdrawal_id UUID NOT NULL REFERENCES withdrawal_requests (id),
  decision STRING NOT NULL CHECK (decision IN ('allow', 'review', 'deny')),
  rule_code STRING NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX withdrawal_risk_decisions_withdrawal_idx ON withdrawal_risk_decisions (withdrawal_id, created_at DESC);
