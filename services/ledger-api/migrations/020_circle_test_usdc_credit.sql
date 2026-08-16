-- Circle official testnet USDC from https://developers.circle.com/stablecoins/usdc-contract-addresses
-- Enables credit only on issuer-documented testnets. BNB, Scroll and TON stay address-only.

INSERT INTO chain_assets (network, asset_code, contract_identifier, minimum_confirmations, enabled, fee_asset_code)
VALUES
  ('polygon-amoy', 'USDC', '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', 64, true, 'POL'),
  ('arbitrum-sepolia', 'USDC', '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', 20, true, 'ETH'),
  ('optimism-sepolia', 'USDC', '0x5fd84259d66Cd46123540766Be93DFE6D43130D7', 20, true, 'ETH'),
  ('linea-sepolia', 'USDC', '0xFEce4462D57bD51A6A552365A011b95f0E16d9B7', 20, true, 'ETH')
ON CONFLICT (network, asset_code) DO NOTHING;
