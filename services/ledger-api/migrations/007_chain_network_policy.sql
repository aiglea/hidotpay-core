CREATE TABLE chain_networks (
  network STRING PRIMARY KEY,
  chain_family STRING NOT NULL CHECK (chain_family IN ('evm', 'tron')),
  chain_identifier STRING NOT NULL UNIQUE,
  enabled BOOL NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chain_assets ADD COLUMN fee_asset_code STRING REFERENCES assets (code);
