-- V1 product chains from wallet_security_plan.md section 21.
-- Mainnet contracts are documented in docs, not inserted. Credit still rejects any *mainnet* name.

ALTER TABLE chain_networks DROP CONSTRAINT IF EXISTS check_chain_family;
ALTER TABLE chain_networks DROP CONSTRAINT IF EXISTS chain_networks_chain_family_check;
ALTER TABLE chain_networks ADD CONSTRAINT check_chain_family CHECK (chain_family IN (
  'evm', 'tron', 'bitcoin', 'solana', 'ton', 'xrp', 'stellar'
));

INSERT INTO assets (code, display_name, decimals)
VALUES
  ('USDC', 'USD Coin', 6),
  ('BTC', 'Bitcoin', 8),
  ('XRP', 'XRP', 6),
  ('BNB', 'BNB', 18),
  ('POL', 'POL', 18),
  ('AVAX', 'Avalanche', 18),
  ('SOL', 'Solana', 9),
  ('TON', 'Toncoin', 9),
  ('XLM', 'Stellar Lumens', 7)
ON CONFLICT (code) DO NOTHING;

INSERT INTO chain_networks (network, chain_family, chain_identifier)
VALUES
  ('bnb-testnet', 'evm', '97'),
  ('polygon-amoy', 'evm', '80002'),
  ('arbitrum-sepolia', 'evm', '421614'),
  ('optimism-sepolia', 'evm', '11155420'),
  ('base-sepolia', 'evm', '84532'),
  ('avalanche-fuji', 'evm', '43113'),
  ('linea-sepolia', 'evm', '59141'),
  ('scroll-sepolia', 'evm', '534351'),
  ('bitcoin-testnet4', 'bitcoin', 'testnet4'),
  ('solana-devnet', 'solana', 'devnet'),
  ('ton-testnet', 'ton', 'ton-testnet'),
  ('xrpl-testnet', 'xrp', 'xrpl-testnet'),
  ('stellar-testnet', 'stellar', 'stellar-testnet')
ON CONFLICT (network) DO NOTHING;

-- Only verified public test assets are enabled for credit.
INSERT INTO chain_assets (network, asset_code, contract_identifier, minimum_confirmations, enabled, fee_asset_code)
VALUES
  ('base-sepolia', 'USDC', '0x036CbD53842c5426634e7929541eC2318f3dCF7e', 20, true, 'ETH'),
  ('avalanche-fuji', 'USDT', '0xAb231A5744C8E6c45481754928cCfFFFD4aa0732', 12, true, 'AVAX'),
  ('bitcoin-testnet4', 'BTC', 'native:btc', 3, true, 'BTC'),
  ('solana-devnet', 'USDC', '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', 32, true, 'SOL'),
  ('xrpl-testnet', 'XRP', 'native:xrp', 1, true, 'XRP'),
  ('stellar-testnet', 'USDC', 'USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', 1, true, 'XLM')
ON CONFLICT (network, asset_code) DO NOTHING;
