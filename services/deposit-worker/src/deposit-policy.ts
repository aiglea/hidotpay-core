import type { DepositPolicy } from './scanner.js';
import type { DepositAssetPolicy } from './postgres-deposit-catalog.js';

export class DatabaseDepositPolicy implements DepositPolicy {
  private readonly assets = new Map<string, DepositAssetPolicy>();

  public constructor(private readonly network: string, policies: DepositAssetPolicy[]) {
    for (const policy of policies) {
      if (this.assets.has(policy.assetCode) || policy.minimumConfirmations < 1) throw new Error('database deposit policy is invalid');
      this.assets.set(policy.assetCode, policy);
    }
  }

  public get(network: string, assetCode: string): { contractIdentifier: string } {
    return { contractIdentifier: this.asset(network, assetCode).contractIdentifier };
  }

  public requireDeposit(input: { assetCode: string; confirmationCount: number; contractIdentifier: string; network: string }): void {
    const policy = this.asset(input.network, input.assetCode);
    if (policy.contractIdentifier !== input.contractIdentifier) throw new Error('deposit contract is not official');
    if (!Number.isSafeInteger(input.confirmationCount) || input.confirmationCount < policy.minimumConfirmations) throw new Error('deposit is not final');
  }

  private asset(network: string, assetCode: string): DepositAssetPolicy {
    if (network !== this.network) throw new Error('deposit network is not configured');
    const policy = this.assets.get(assetCode);
    if (!policy) throw new Error('deposit asset is not enabled');
    return policy;
  }
}
