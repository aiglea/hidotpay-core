export type WithdrawalWorkflowDependencies = {
  broadcast(): Promise<{ confirmed: boolean; transactionHash: string }>;
  releaseBeforeBroadcast(): Promise<void>;
  requestHumanReview(input: { reason: string; transactionHash: string; withdrawalId: string }): Promise<void>;
  settleConfirmed(input: { transactionHash: string; withdrawalId: string }): Promise<void>;
};

export const workflowId = {
  deposit: (depositId: string): string => stableId('deposit', depositId),
  reconciliation: (ledgerTransactionId: string): string => stableId('reconciliation', ledgerTransactionId),
  withdrawal: (withdrawalId: string): string => stableId('withdrawal', withdrawalId),
};

export async function executeWithdrawalWorkflow(
  input: { withdrawalId: string },
  dependencies: WithdrawalWorkflowDependencies,
): Promise<{ status: 'confirmed' | 'manual_review'; withdrawalId: string }> {
  const broadcast = await dependencies.broadcast();
  if (!/^0x[0-9a-f]{64}$/i.test(broadcast.transactionHash)) throw new Error('broadcast returned an invalid transaction hash');
  if (!broadcast.confirmed) {
    await dependencies.requestHumanReview({
      reason: 'chain transaction is broadcast but not confirmed',
      transactionHash: broadcast.transactionHash,
      withdrawalId: input.withdrawalId,
    });
    return { status: 'manual_review', withdrawalId: input.withdrawalId };
  }
  await dependencies.settleConfirmed({ transactionHash: broadcast.transactionHash, withdrawalId: input.withdrawalId });
  return { status: 'confirmed', withdrawalId: input.withdrawalId };
}

function stableId(prefix: string, id: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(id)) throw new Error('workflow source id is invalid');
  return `${prefix}:${id}`;
}
