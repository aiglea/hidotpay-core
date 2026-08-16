import { DomainError } from './errors.js';
import { depositAddressAliases, officialTestnetDepositNetworks } from './product-chains.js';

export const OFFICIAL_TESTNET_DEPOSIT_NETWORKS = officialTestnetDepositNetworks();

export function isMainnetDepositNetwork(network: string): boolean {
  return /(^|[-_])mainnet($|[-_])/i.test(network);
}

export function assertOfficialTestnetDepositNetwork(network: string): void {
  if (isMainnetDepositNetwork(network)) throw new DomainError('deposit_mainnet_disabled');
  if (!OFFICIAL_TESTNET_DEPOSIT_NETWORKS.has(network)) throw new DomainError('invalid_network');
}

export function depositAddressNetworks(network: string): readonly string[] {
  assertOfficialTestnetDepositNetwork(network);
  return depositAddressAliases(network);
}
