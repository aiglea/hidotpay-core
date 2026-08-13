CREATE TABLE chain_assets (
  network STRING NOT NULL,
  asset_code STRING NOT NULL REFERENCES assets (code),
  contract_identifier STRING NOT NULL,
  minimum_confirmations INT8 NOT NULL CHECK (minimum_confirmations > 0),
  enabled BOOL NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (network, asset_code)
);
