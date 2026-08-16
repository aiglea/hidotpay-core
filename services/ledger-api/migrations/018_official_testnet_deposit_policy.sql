-- Official staging testnet assets only. These are not Tether production contracts.
-- Sepolia USDT is a commonly used public test token, not issued by Tether.
-- Shasta USDT is the well-known TRON testnet USDT used by this repository's scanner tests.

INSERT INTO assets (code, display_name, decimals)
VALUES
  ('USDT', 'Tether USD', 6),
  ('ETH', 'Ether', 18),
  ('TRX', 'TRON', 6)
ON CONFLICT (code) DO NOTHING;

INSERT INTO chain_networks (network, chain_family, chain_identifier)
VALUES
  ('ethereum-sepolia', 'evm', '11155111'),
  ('tron-shasta', 'tron', '0000000000000000de1aa88295e1fcf982742f773e0419c5a9c134c994a9059e')
ON CONFLICT (network) DO NOTHING;

INSERT INTO chain_assets (network, asset_code, contract_identifier, minimum_confirmations, enabled, fee_asset_code)
VALUES
  ('ethereum-sepolia', 'USDT', '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06', 12, true, 'ETH'),
  ('tron-shasta', 'USDT', 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj', 19, true, 'TRX')
ON CONFLICT (network, asset_code) DO NOTHING;
