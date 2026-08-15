export type ApprovedWithdrawal = {
  amountAtoms: string;
  assetCode: string;
  destinationAddress: string;
  id: string;
  network: string;
  signedPayload: string;
};

export interface WithdrawalExecutionStore {
  markBroadcast(withdrawalId: string, chainTransactionHash: string): Promise<void>;
  releaseBeforeBroadcast(withdrawalId: string, reason: string): Promise<void>;
  settleConfirmed(withdrawalId: string, chainTransactionHash: string): Promise<void>;
}

export interface PrivateWithdrawalSigner {
  sign(withdrawal: ApprovedWithdrawal): Promise<{ chainTransactionHash: string; signedPayload: string }>;
}

export interface ChainBroadcaster {
  broadcast(input: { chainTransactionHash: string; network: string; signedPayload: string }): Promise<{ confirmed: boolean }>;
}

/**
 * The worker keeps the irreversible boundary explicit. A signer failure occurs
 * before a transaction hash exists and can release the frozen balance. Once
 * `markBroadcast` succeeds, no automatic release is permitted: an RPC timeout
 * may still mean the signed transaction reached the chain.
 */
export class WithdrawalExecutionWorker {
  public constructor(
    private readonly store: WithdrawalExecutionStore,
    private readonly dependencies: { broadcaster: ChainBroadcaster; signer: PrivateWithdrawalSigner },
  ) {}

  public async execute(withdrawal: ApprovedWithdrawal): Promise<{ status: 'broadcast' | 'confirmed'; withdrawalId: string }> {
    let signed: { chainTransactionHash: string; signedPayload: string };
    try {
      const response = await this.dependencies.signer.sign(withdrawal);
      try {
        signed = snapshotSignedTransaction(response);
      } catch {
        throw new Error('signer returned an invalid signed transaction');
      }
    } catch (error) {
      await this.store.releaseBeforeBroadcast(withdrawal.id, boundedError(error));
      throw error;
    }

    await this.store.markBroadcast(withdrawal.id, signed.chainTransactionHash);
    const broadcast = await this.dependencies.broadcaster.broadcast({
      chainTransactionHash: signed.chainTransactionHash,
      network: withdrawal.network,
      signedPayload: signed.signedPayload,
    });
    if (!broadcast.confirmed) return { status: 'broadcast', withdrawalId: withdrawal.id };
    await this.store.settleConfirmed(withdrawal.id, signed.chainTransactionHash);
    return { status: 'confirmed', withdrawalId: withdrawal.id };
  }
}

function snapshotSignedTransaction(value: unknown): { chainTransactionHash: string; signedPayload: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid signer response');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const chainTransactionHash = descriptors.chainTransactionHash?.value;
  const signedPayload = descriptors.signedPayload?.value;
  if (typeof chainTransactionHash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(chainTransactionHash)) throw new Error('invalid signer response');
  if (typeof signedPayload !== 'string' || signedPayload.length === 0) throw new Error('invalid signer response');
  return { chainTransactionHash, signedPayload };
}

function boundedError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'signer failed before broadcast';
  return message.replace(/[\r\n]/g, ' ').slice(0, 512);
}
