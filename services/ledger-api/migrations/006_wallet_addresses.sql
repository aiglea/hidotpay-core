CREATE TABLE wallet_key_versions (
  key_version INT8 PRIMARY KEY CHECK (key_version > 0),
  signer_key_ref STRING NOT NULL UNIQUE,
  status STRING NOT NULL CHECK (status IN ('active', 'retiring', 'retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wallet_derivation_counters (
  network STRING PRIMARY KEY,
  next_index INT8 NOT NULL CHECK (next_index >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wallet_addresses (
  id UUID PRIMARY KEY,
  owner_id STRING NOT NULL,
  account_id UUID NOT NULL REFERENCES accounts (id),
  network STRING NOT NULL,
  key_version INT8 NOT NULL REFERENCES wallet_key_versions (key_version),
  derivation_index INT8 NOT NULL CHECK (derivation_index >= 0),
  address STRING NOT NULL,
  status STRING NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retiring', 'retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, network),
  UNIQUE (network, key_version, derivation_index),
  UNIQUE (network, address)
);

CREATE INDEX wallet_addresses_account_idx ON wallet_addresses (account_id, network);
