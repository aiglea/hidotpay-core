export type DepositWorkflowInput = { depositId: string };

export type WithdrawalWorkflowInput = { withdrawalId: string };

export type ReconciliationWorkflowInput = { ledgerTransactionId: string };

export type WorkflowActivities = {
  creditDeposit(input: DepositWorkflowInput): Promise<{ depositId: string; status: 'credited' }>;
  reconcileLedger(input: ReconciliationWorkflowInput): Promise<{ ledgerTransactionId: string; status: 'applied' | 'queued' }>;
  broadcastWithdrawal(input: WithdrawalWorkflowInput): Promise<{ confirmed: boolean; transactionHash: string }>;
  requestWithdrawalHumanReview(input: { reason: string; transactionHash: string; withdrawalId: string }): Promise<void>;
  settleConfirmedWithdrawal(input: { transactionHash: string; withdrawalId: string }): Promise<void>;
};
