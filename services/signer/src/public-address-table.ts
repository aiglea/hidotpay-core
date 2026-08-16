import {
  isSolanaProductNetwork,
  isStellarProductNetwork,
  isTonProductNetwork,
} from './product-networks.js';
import { DomainError } from './domain-errors.js';
import type { DepositAddressBackend } from './deposit-address-service.js';

export type PublicAddressTables = {
  solana: readonly string[];
  stellar: readonly string[];
  ton: readonly string[];
};

export class PublicAddressTableBackend implements DepositAddressBackend {
  public constructor(private readonly tables: PublicAddressTables) {
    for (const [name, table] of Object.entries(tables)) {
      if (!Array.isArray(table) || table.length < 1 || table.some((address) => typeof address !== 'string' || address.length < 8)) {
        throw new DomainError('signer_xpub_required');
      }
      void name;
    }
  }

  public async deriveDepositAddress(input: { derivationIndex: number; keyVersion: number; network: string }): Promise<string> {
    const table = this.tableFor(input.network);
    const address = table[input.derivationIndex];
    if (!address) throw new DomainError('signer_backend_failed');
    return address;
  }

  private tableFor(network: string): readonly string[] {
    if (isSolanaProductNetwork(network)) return this.tables.solana;
    if (isTonProductNetwork(network)) return this.tables.ton;
    if (isStellarProductNetwork(network)) return this.tables.stellar;
    throw new DomainError('signer_network_forbidden');
  }
}

export function parsePublicAddressTable(value: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new DomainError('signer_xpub_required');
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.some((address) => typeof address !== 'string' || address.length < 8)) {
    throw new DomainError('signer_xpub_required');
  }
  return parsed;
}

export function loadPublicAddressTable(env: Record<string, string | undefined>, name: string): string[] {
  const single = env[name];
  if (single) return parsePublicAddressTable(single);
  const rows: string[] = [];
  for (let index = 0; index < 32; index += 1) {
    const chunk = env[`${name}_${index}`];
    if (!chunk) {
      if (index === 0) throw new DomainError('signer_xpub_required');
      break;
    }
    rows.push(...parsePublicAddressTable(chunk));
  }
  return rows;
}
