import { assertOfficialTestnetDepositNetwork, isMainnetDepositNetwork } from '../../ledger-api/src/domain/deposit-credit-policy.js';
import { creditLiveChains, V1_PRODUCT_CHAINS } from '../../ledger-api/src/domain/product-chains.js';
import { DomainError } from '../../ledger-api/src/domain/errors.js';

export const PUBLIC_TESTNET_RPCS = Object.freeze(
  Object.fromEntries(V1_PRODUCT_CHAINS.map((chain) => [chain.testnet, chain.rpcUrls])) as Record<string, readonly string[]>,
);

export const TRON_SHASTA_GENESIS_BLOCK_HASH = '0000000000000000de1aa88295e1fcf982742f773e0419c5a9c134c994a9059e';
const PUBLIC_TRON_API_KEY = 'public-shasta-no-key';

export type OfficialTestnetScannerConfig = {
  bitcoinNetworks: Array<{ network: string; rpcUrls: readonly string[] }>;
  evmNetworks: Array<{ chainId: number; firstBlock: number; network: string; rpcUrls: readonly string[] }>;
  ledgerBearerToken: string;
  maxBlockRange: number;
  reorgWindow: number;
  solanaNetworks: Array<{ network: string; rpcUrls: readonly string[] }>;
  stellarNetworks: Array<{ network: string; rpcUrls: readonly string[] }>;
  tronNetworks: Array<{ apiKey: string; firstBlock: number; genesisBlockHash: string; network: string; rpcUrls: readonly string[] }>;
  xrplNetworks: Array<{ network: string; rpcUrls: readonly string[] }>;
};

export function loadOfficialTestnetScannerConfig(env: Record<string, string | undefined>): OfficialTestnetScannerConfig {
  const ledgerBearerToken = env.CHAIN_OPERATOR_TOKEN;
  if (!ledgerBearerToken || ledgerBearerToken.length < 16) throw new Error('CHAIN_OPERATOR_TOKEN is required');
  if (env.DEPOSIT_EVM_NETWORKS) rejectConfiguredNetworks(env.DEPOSIT_EVM_NETWORKS, 'DEPOSIT_EVM_NETWORKS');
  if (env.DEPOSIT_TRON_NETWORKS) rejectConfiguredNetworks(env.DEPOSIT_TRON_NETWORKS, 'DEPOSIT_TRON_NETWORKS');

  const live = creditLiveChains();
  const evmNetworks = live.filter((chain) => chain.family === 'evm' && chain.evmChainId).map((chain) => ({
    chainId: chain.evmChainId!,
    firstBlock: 0,
    network: chain.testnet,
    rpcUrls: chain.rpcUrls,
  }));
  const tronNetworks = live.filter((chain) => chain.family === 'tron').map((chain) => ({
    apiKey: env.TRON_SHASTA_API_KEY && env.TRON_SHASTA_API_KEY.length >= 16 ? env.TRON_SHASTA_API_KEY : PUBLIC_TRON_API_KEY,
    firstBlock: 0,
    genesisBlockHash: TRON_SHASTA_GENESIS_BLOCK_HASH,
    network: chain.testnet,
    rpcUrls: chain.rpcUrls,
  }));
  const bitcoinNetworks = live.filter((chain) => chain.family === 'bitcoin').map((chain) => ({ network: chain.testnet, rpcUrls: chain.rpcUrls }));
  const solanaNetworks = live.filter((chain) => chain.family === 'solana').map((chain) => ({ network: chain.testnet, rpcUrls: chain.rpcUrls }));
  const stellarNetworks = live.filter((chain) => chain.family === 'stellar').map((chain) => ({ network: chain.testnet, rpcUrls: chain.rpcUrls }));
  const xrplNetworks = live.filter((chain) => chain.family === 'xrp').map((chain) => ({ network: chain.testnet, rpcUrls: chain.rpcUrls }));

  for (const network of [...evmNetworks, ...tronNetworks, ...bitcoinNetworks, ...solanaNetworks, ...stellarNetworks, ...xrplNetworks]) {
    assertOfficialTestnetDepositNetwork(network.network);
  }
  return {
    bitcoinNetworks,
    evmNetworks,
    ledgerBearerToken,
    maxBlockRange: 100,
    reorgWindow: 32,
    solanaNetworks,
    stellarNetworks,
    tronNetworks,
    xrplNetworks,
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
