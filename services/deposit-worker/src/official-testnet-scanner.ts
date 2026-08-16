import { assertOfficialTestnetDepositNetwork, isMainnetDepositNetwork } from '../../ledger-api/src/domain/deposit-credit-policy.js';
import { DomainError } from '../../ledger-api/src/domain/errors.js';

export const PUBLIC_TESTNET_RPCS = Object.freeze({
  'ethereum-sepolia': Object.freeze([
    'https://rpc.sepolia.org',
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://1rpc.io/sepolia',
  ]),
  'tron-shasta': Object.freeze([
    'https://api.shasta.trongrid.io',
  ]),
});

export const TRON_SHASTA_GENESIS_BLOCK_HASH = '0000000000000000de1aa88295e1fcf982742f773e0419c5a9c134c994a9059e';
const PUBLIC_TRON_API_KEY = 'public-shasta-no-key';

export type OfficialTestnetScannerConfig = {
  evmNetworks: Array<{ chainId: number; firstBlock: number; network: string; rpcUrls: readonly string[] }>;
  ledgerBearerToken: string;
  maxBlockRange: number;
  reorgWindow: number;
  tronNetworks: Array<{ apiKey: string; firstBlock: number; genesisBlockHash: string; network: string; rpcUrls: readonly string[] }>;
};

export function loadOfficialTestnetScannerConfig(env: Record<string, string | undefined>): OfficialTestnetScannerConfig {
  const ledgerBearerToken = env.CHAIN_OPERATOR_TOKEN;
  if (!ledgerBearerToken || ledgerBearerToken.length < 16) throw new Error('CHAIN_OPERATOR_TOKEN is required');
  if (env.DEPOSIT_EVM_NETWORKS) rejectConfiguredNetworks(env.DEPOSIT_EVM_NETWORKS, 'DEPOSIT_EVM_NETWORKS');
  if (env.DEPOSIT_TRON_NETWORKS) rejectConfiguredNetworks(env.DEPOSIT_TRON_NETWORKS, 'DEPOSIT_TRON_NETWORKS');

  const evmNetworks = [{
    chainId: 11155111,
    firstBlock: 0,
    network: 'ethereum-sepolia',
    rpcUrls: PUBLIC_TESTNET_RPCS['ethereum-sepolia'],
  }];
  const tronNetworks = [{
    apiKey: env.TRON_SHASTA_API_KEY && env.TRON_SHASTA_API_KEY.length >= 16 ? env.TRON_SHASTA_API_KEY : PUBLIC_TRON_API_KEY,
    firstBlock: 0,
    genesisBlockHash: TRON_SHASTA_GENESIS_BLOCK_HASH,
    network: 'tron-shasta',
    rpcUrls: PUBLIC_TESTNET_RPCS['tron-shasta'],
  }];
  for (const network of [...evmNetworks, ...tronNetworks]) assertOfficialTestnetDepositNetwork(network.network);
  return {
    evmNetworks,
    ledgerBearerToken,
    maxBlockRange: 100,
    reorgWindow: 32,
    tronNetworks,
  };
}

function rejectConfiguredNetworks(value: string, name: string): void {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error(`${name} must be JSON`); }
  if (!Array.isArray(parsed)) throw new Error(`${name} must be JSON`);
  for (const item of parsed) {
    const network = item && typeof item === 'object' ? (item as { network?: unknown }).network : undefined;
    if (typeof network !== 'string') continue;
    if (isMainnetDepositNetwork(network)) throw new DomainError('deposit_mainnet_disabled');
    assertOfficialTestnetDepositNetwork(network);
  }
}
