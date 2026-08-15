CREATE TABLE chain_scan_cursors (
  network STRING PRIMARY KEY,
  block_height INT8 NOT NULL CHECK (block_height >= 0),
  block_hash STRING NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chain_deposit_observations (
  id UUID PRIMARY KEY,
  network STRING NOT NULL,
  transaction_hash STRING NOT NULL,
  event_index INT8 NOT NULL CHECK (event_index >= 0),
  block_height INT8 NOT NULL CHECK (block_height >= 0),
  block_hash STRING NOT NULL,
  contract_identifier STRING NOT NULL,
  destination_address STRING NOT NULL,
  account_id UUID NOT NULL REFERENCES accounts (id),
  asset_code STRING NOT NULL REFERENCES assets (code),
  amount_atoms DECIMAL(39, 0) NOT NULL CHECK (amount_atoms > 0),
  status STRING NOT NULL CHECK (status IN ('observed', 'finalized_candidate', 'credited', 'orphaned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (network, transaction_hash, event_index)
);

CREATE INDEX chain_deposit_observations_status_idx ON chain_deposit_observations (status, network, block_height);
