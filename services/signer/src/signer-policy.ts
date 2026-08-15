import { createHash, randomUUID } from 'node:crypto';

import { DomainError } from './domain-errors.js';

export type WithdrawalSigningRequest = {
  amountAtoms: string;
  assetCode: string;
  caller: string;
  derivationIndex: number;
  destinationAddress: string;
  keyVersion: number;
  network: string;
  payloadHash: string;
  withdrawalId: string;
};

export type SigningResult = {
  auditId: string;
  keyVersion: number;
  signature: string;
};

export type SignerAuditRecord = {
  auditId: string;
  keyVersion: number;
  network: string;
  outcome: 'rejected' | 'signed';
  reason?: string;
  requestedAt: string;
  withdrawalId: string;
};

export interface SigningBackend {
  sign(input: Pick<WithdrawalSigningRequest, 'derivationIndex' | 'keyVersion' | 'network' | 'payloadHash'>): Promise<string>;
}

export type SignerPolicyConfig = {
  allowedNetworks: string[];
  mainnetEnabled: boolean;
  maxWithdrawalAtoms: string;
  trustedCaller: string;
};

export class SignerPolicy {
  private readonly records: SignerAuditRecord[] = [];
  private readonly allowedNetworks: Set<string>;
  private readonly maxWithdrawalAtoms: bigint;

  public constructor(private readonly config: SignerPolicyConfig, private readonly backend: SigningBackend) {
    this.allowedNetworks = new Set(config.allowedNetworks);
    if (this.allowedNetworks.size === 0) throw new Error('signer requires at least one allowed network');
    if (!/^[1-9][0-9]*$/.test(config.maxWithdrawalAtoms)) throw new Error('maxWithdrawalAtoms must be a positive atom amount');
    this.maxWithdrawalAtoms = BigInt(config.maxWithdrawalAtoms);
  }

  public auditLog(): readonly SignerAuditRecord[] {
    return this.records.map((record) => ({ ...record }));
  }

  public async signWithdrawal(request: WithdrawalSigningRequest): Promise<SigningResult> {
    const auditId = randomUUID();
    try {
      this.validateRequest(request);
      const signature = await this.backend.sign(request);
      if (typeof signature !== 'string' || signature.length === 0) throw new Error('signing backend returned no signature');
      this.records.push({ auditId, keyVersion: request.keyVersion, network: request.network, outcome: 'signed', requestedAt: new Date().toISOString(), withdrawalId: request.withdrawalId });
      return { auditId, keyVersion: request.keyVersion, signature };
    } catch (error) {
      const reason = error instanceof DomainError ? error.code : 'signer_backend_failed';
      this.records.push({ auditId, keyVersion: request.keyVersion, network: request.network, outcome: 'rejected', reason, requestedAt: new Date().toISOString(), withdrawalId: request.withdrawalId });
      throw error;
    }
  }

  private validateRequest(request: WithdrawalSigningRequest): void {
    if (request.caller !== this.config.trustedCaller) throw new DomainError('signer_caller_forbidden');
    if (!this.allowedNetworks.has(request.network)) throw new DomainError('signer_network_forbidden');
    if (!this.config.mainnetEnabled && /(^|[-_])mainnet($|[-_])/i.test(request.network)) throw new DomainError('signer_mainnet_disabled');
    if (!Number.isSafeInteger(request.derivationIndex) || request.derivationIndex < 0 || !Number.isSafeInteger(request.keyVersion) || request.keyVersion < 1) {
      throw new DomainError('signer_invalid_key_reference');
    }
    if (!/^[1-9][0-9]*$/.test(request.amountAtoms) || BigInt(request.amountAtoms) > this.maxWithdrawalAtoms) throw new DomainError('signer_amount_limit_exceeded');
    if (!/^[0-9a-f]{64}$/i.test(request.payloadHash)) throw new DomainError('signer_invalid_payload');
    if (!/^[0-9a-f-]{36}$/i.test(request.withdrawalId)) throw new DomainError('signer_invalid_withdrawal');
    if (!this.matchesNetworkAddress(request.network, request.destinationAddress)) throw new DomainError('signer_invalid_destination');
  }

  private matchesNetworkAddress(network: string, address: string): boolean {
    if (network.startsWith('ethereum-')) return /^0x[0-9a-f]{40}$/i.test(address);
    if (network.startsWith('tron-')) return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
    return false;
  }
}

/** Test-only backend. Its output deliberately proves that no private key exists in this process. */
export class InMemorySigningBackend implements SigningBackend {
  public async sign(input: Pick<WithdrawalSigningRequest, 'derivationIndex' | 'keyVersion' | 'network' | 'payloadHash'>): Promise<string> {
    const digest = createHash('sha256').update(`${input.network}:${input.keyVersion}:${input.derivationIndex}:${input.payloadHash}`).digest('hex');
    return `test-signature:${digest}`;
  }
}
