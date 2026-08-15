import { randomUUID } from 'node:crypto';

import { DomainError } from './domain-errors.js';

export type DepositAddressRequest = {
  caller: string;
  derivationIndex: number;
  keyVersion: number;
  network: string;
};

export type DerivedDepositAddress = {
  address: string;
  keyVersion: number;
  network: string;
};

export type DepositAddressAuditRecord = {
  auditId: string;
  derivationIndex: number;
  keyVersion: number;
  network: string;
  outcome: 'derived' | 'rejected';
  reason?: string;
  requestedAt: string;
};

/**
 * This backend must be implemented by an HSM/Web3Signer-backed process.
 * It receives only a key reference and returns public address text; this
 * service deliberately has no private-key, seed, or mnemonic input.
 */
export interface DepositAddressBackend {
  deriveDepositAddress(input: Pick<DepositAddressRequest, 'derivationIndex' | 'keyVersion' | 'network'>): Promise<string>;
}

export type DepositAddressServiceConfig = {
  allowedNetworks: string[];
  mainnetEnabled: boolean;
  trustedCaller: string;
};

export class DepositAddressService {
  private readonly allowedNetworks: Set<string>;
  private readonly records: DepositAddressAuditRecord[] = [];

  public constructor(private readonly config: DepositAddressServiceConfig, private readonly backend: DepositAddressBackend) {
    this.allowedNetworks = new Set(config.allowedNetworks);
    if (this.allowedNetworks.size === 0) throw new Error('signer requires at least one allowed network');
  }

  public auditLog(): readonly DepositAddressAuditRecord[] {
    return this.records.map((record) => ({ ...record }));
  }

  public async deriveDepositAddress(request: DepositAddressRequest): Promise<DerivedDepositAddress> {
    const auditId = randomUUID();
    try {
      this.validateRequest(request);
      const address = await this.backend.deriveDepositAddress(request);
      if (!this.matchesNetworkAddress(request.network, address)) throw new DomainError('signer_invalid_derived_address');
      this.records.push({
        auditId,
        derivationIndex: request.derivationIndex,
        keyVersion: request.keyVersion,
        network: request.network,
        outcome: 'derived',
        requestedAt: new Date().toISOString(),
      });
      return { address, keyVersion: request.keyVersion, network: request.network };
    } catch (error) {
      const reason = error instanceof DomainError ? error.code : 'signer_backend_failed';
      this.records.push({
        auditId,
        derivationIndex: request.derivationIndex,
        keyVersion: request.keyVersion,
        network: request.network,
        outcome: 'rejected',
        reason,
        requestedAt: new Date().toISOString(),
      });
      throw error;
    }
  }

  private validateRequest(request: DepositAddressRequest): void {
    if (request.caller !== this.config.trustedCaller) throw new DomainError('signer_caller_forbidden');
    if (!this.allowedNetworks.has(request.network)) throw new DomainError('signer_network_forbidden');
    if (!this.config.mainnetEnabled && /(^|[-_])mainnet($|[-_])/i.test(request.network)) throw new DomainError('signer_mainnet_disabled');
    if (!Number.isSafeInteger(request.derivationIndex) || request.derivationIndex < 0 || !Number.isSafeInteger(request.keyVersion) || request.keyVersion < 1) {
      throw new DomainError('signer_invalid_key_reference');
    }
  }

  private matchesNetworkAddress(network: string, address: string): boolean {
    if (network.startsWith('ethereum-')) return /^0x[0-9a-f]{40}$/i.test(address);
    if (network.startsWith('tron-')) return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
    return false;
  }
}
