CREATE TABLE schema_migrations (
  version STRING PRIMARY KEY,
  checksum STRING NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE assets (
  code STRING PRIMARY KEY,
  display_name STRING NOT NULL,
  decimals INT8 NOT NULL CHECK (decimals >= 0 AND decimals <= 30),
  enabled BOOL NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
  id UUID PRIMARY KEY,
  owner_id STRING NOT NULL,
  account_kind STRING NOT NULL CHECK (account_kind IN (
    'user_available', 'user_frozen', 'platform_treasury', 'platform_settlement'
  )),
  status STRING NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, account_kind)
);

CREATE TABLE account_balances (
  account_id UUID NOT NULL REFERENCES accounts (id),
  asset_code STRING NOT NULL REFERENCES assets (code),
  balance_atoms DECIMAL(39, 0) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, asset_code),
  CHECK (balance_atoms >= 0)
);

CREATE TABLE ledger_transactions (
  id UUID PRIMARY KEY,
  transaction_type STRING NOT NULL CHECK (transaction_type IN (
    'internal_transfer', 'deposit_credit', 'withdrawal_freeze', 'withdrawal_release', 'withdrawal_settle'
  )),
  status STRING NOT NULL DEFAULT 'committed' CHECK (status = 'committed'),
  idempotency_scope STRING NOT NULL,
  idempotency_key STRING NOT NULL,
  request_hash STRING NOT NULL,
  actor_id STRING NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (idempotency_scope, idempotency_key)
);

CREATE TABLE ledger_postings (
  id UUID PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES ledger_transactions (id),
  account_id UUID NOT NULL REFERENCES accounts (id),
  asset_code STRING NOT NULL REFERENCES assets (code),
  amount_atoms DECIMAL(39, 0) NOT NULL CHECK (amount_atoms != 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ledger_postings_transaction_idx ON ledger_postings (transaction_id);
CREATE INDEX ledger_postings_account_idx ON ledger_postings (account_id, asset_code, created_at DESC);

CREATE TABLE idempotency_records (
  scope STRING NOT NULL,
  idempotency_key STRING NOT NULL,
  request_hash STRING NOT NULL,
  response_status INT8 NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, idempotency_key)
);

CREATE TABLE deposit_receipts (
  id UUID PRIMARY KEY,
  network STRING NOT NULL,
  transaction_hash STRING NOT NULL,
  output_index INT8 NOT NULL DEFAULT 0 CHECK (output_index >= 0),
  asset_code STRING NOT NULL REFERENCES assets (code),
  destination_account_id UUID NOT NULL REFERENCES accounts (id),
  amount_atoms DECIMAL(39, 0) NOT NULL CHECK (amount_atoms > 0),
  confirmation_count INT8 NOT NULL CHECK (confirmation_count > 0),
  credited_transaction_id UUID REFERENCES ledger_transactions (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (network, transaction_hash, output_index)
);

CREATE TABLE withdrawal_requests (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts (id),
  frozen_account_id UUID NOT NULL REFERENCES accounts (id),
  asset_code STRING NOT NULL REFERENCES assets (code),
  amount_atoms DECIMAL(39, 0) NOT NULL CHECK (amount_atoms > 0),
  fee_atoms DECIMAL(39, 0) NOT NULL DEFAULT 0 CHECK (fee_atoms >= 0),
  network STRING NOT NULL,
  destination_address STRING NOT NULL,
  status STRING NOT NULL CHECK (status IN ('pending_review', 'approved', 'broadcast', 'confirmed', 'rejected', 'failed')),
  requested_by STRING NOT NULL,
  reviewed_by STRING,
  chain_transaction_hash STRING,
  failure_reason STRING,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX withdrawal_requests_status_idx ON withdrawal_requests (status, created_at);

CREATE TABLE outbox_events (
  id UUID PRIMARY KEY,
  event_type STRING NOT NULL,
  aggregate_type STRING NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  attempts INT8 NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);

CREATE INDEX outbox_events_pending_idx ON outbox_events (published_at, created_at);
