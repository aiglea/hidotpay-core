import { DomainError } from './errors.js';

export const OFFICIAL_TESTNET_DEPOSIT_NETWORKS = Object.freeze(new Set(['ethereum-sepolia', 'tron-shasta']));

const ADDRESS_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'ethereum-sepolia': ['ethereum-sepolia', 'ethereum'],
  'tron-shasta': ['tron-shasta', 'tron'],
};

export function isMainnetDepositNetwork(network: string): boolean {
  return /(^|[-_])mainnet($|[-_])/i.test(network);
}

export function assertOfficialTestnetDepositNetwork(network: string): void {
  if (isMainnetDepositNetwork(network)) throw new DomainError('deposit_mainnet_disabled');
  if (!OFFICIAL_TESTNET_DEPOSIT_NETWORKS.has(network)) throw new DomainError('invalid_network');
}

export function depositAddressNetworks(network: string): readonly string[] {
  assertOfficialTestnetDepositNetwork(network);
  return ADDRESS_ALIASES[network] ?? [network];
}
