import { DomainError } from '../domain/errors.js';

export type ChainAssetPolicy = {
  assetCode: string;
  contractIdentifier: string;
  decimals: number;
  depositEnabled: boolean;
  feeAssetCode: string;
  minimumConfirmations: number;
  network: string;
  withdrawalEnabled: boolean;
};

export class ChainAssetPolicyRegistry {
  private readonly policies = new Map<string, ChainAssetPolicy>();

  public constructor(policies: ChainAssetPolicy[]) {
    for (const policy of policies) {
      this.validatePolicy(policy);
      const key = this.key(policy.network, policy.assetCode);
      if (this.policies.has(key)) throw new Error(`duplicate chain asset policy: ${key}`);
      this.policies.set(key, Object.freeze({ ...policy }));
    }
  }

  public requireDeposit(input: { assetCode: string; confirmationCount: number; contractIdentifier: string; network: string }): ChainAssetPolicy {
    const policy = this.get(input.network, input.assetCode);
    if (!policy.depositEnabled) throw new DomainError('chain_asset_not_enabled');
    if (policy.contractIdentifier !== input.contractIdentifier) throw new DomainError('deposit_observation_mismatch');
    if (!Number.isSafeInteger(input.confirmationCount) || input.confirmationCount < policy.minimumConfirmations) throw new DomainError('deposit_not_final');
    return policy;
  }

  public requireWithdrawal(input: { assetCode: string; decimals: number; network: string }): ChainAssetPolicy {
    const policy = this.get(input.network, input.assetCode);
    if (!policy.withdrawalEnabled) throw new DomainError('chain_asset_not_enabled');
    if (input.decimals !== policy.decimals) throw new DomainError('asset_precision_mismatch');
    return policy;
  }

  public get(network: string, assetCode: string): ChainAssetPolicy {
    const policy = this.policies.get(this.key(network, assetCode));
    if (!policy) throw new DomainError('chain_asset_not_enabled');
    return policy;
  }

  private key(network: string, assetCode: string): string {
    return `${network}:${assetCode}`;
  }

  private validatePolicy(policy: ChainAssetPolicy): void {
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(policy.network)) throw new Error('invalid policy network');
    if (!/^[A-Z0-9._-]{2,32}$/.test(policy.assetCode) || !/^[A-Z0-9._-]{2,32}$/.test(policy.feeAssetCode)) throw new Error('invalid policy asset');
    if (!/^[A-Za-z0-9:_-]{8,200}$/.test(policy.contractIdentifier)) throw new Error('invalid policy contract identifier');
    if (!Number.isSafeInteger(policy.decimals) || policy.decimals < 0 || policy.decimals > 30) throw new Error('invalid policy decimals');
    if (!Number.isSafeInteger(policy.minimumConfirmations) || policy.minimumConfirmations < 1) throw new Error('invalid policy confirmations');
  }
}
