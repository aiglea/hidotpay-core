import { proxyActivities, sleep } from '@temporalio/workflow';

import type { DepositWorkflowInput, ReconciliationWorkflowInput, WithdrawalWorkflowInput, WorkflowActivities } from './activities.js';

const retriableActivities = proxyActivities<WorkflowActivities>({
  retry: {
    initialInterval: '1 second',
    maximumAttempts: 3,
    maximumInterval: '10 seconds',
  },
  startToCloseTimeout: '30 seconds',
});

// A broadcast timeout can still mean the signed transaction reached the chain.
// It is therefore irreversible and must be escalated, never retried by Temporal.
const irreversibleActivities = proxyActivities<WorkflowActivities>({
  retry: { maximumAttempts: 1 },
  startToCloseTimeout: '30 seconds',
});

/**
 * The activity is idempotent on depositId. Temporal preserves this workflow's
 * history, while Cockroach/Blnk remain the financial source of truth.
 */
export async function depositWorkflow(input: DepositWorkflowInput): Promise<{ depositId: string; status: 'credited' }> {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(input.depositId)) throw new Error('deposit id is invalid');
  return retriableActivities.creditDeposit(input);
}

/**
 * An unconfirmed broadcast is irreversible enough to require human review.
 * This Workflow must never call a release activity after a transaction hash exists.
 */
export async function withdrawalWorkflow(input: WithdrawalWorkflowInput): Promise<{ status: 'confirmed' | 'manual_review'; withdrawalId: string }> {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(input.withdrawalId)) throw new Error('withdrawal id is invalid');
  const broadcast = await irreversibleActivities.broadcastWithdrawal(input);
  if (!/^0x[0-9a-f]{64}$/i.test(broadcast.transactionHash)) throw new Error('broadcast returned an invalid transaction hash');
  if (!broadcast.confirmed) {
    await irreversibleActivities.requestWithdrawalHumanReview({
      reason: 'chain transaction is broadcast but not confirmed',
      transactionHash: broadcast.transactionHash,
      withdrawalId: input.withdrawalId,
    });
    return { status: 'manual_review', withdrawalId: input.withdrawalId };
  }
  await irreversibleActivities.settleConfirmedWithdrawal({ transactionHash: broadcast.transactionHash, withdrawalId: input.withdrawalId });
  return { status: 'confirmed', withdrawalId: input.withdrawalId };
}

/** Reconciliation is keyed by the immutable Cockroach ledger transaction id. */
export async function reconciliationWorkflow(input: ReconciliationWorkflowInput): Promise<{ ledgerTransactionId: string; status: 'applied' }> {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(input.ledgerTransactionId)) throw new Error('ledger transaction id is invalid');
  for (;;) {
    const result = await retriableActivities.reconcileLedger(input);
    if (result.status === 'applied') return { ledgerTransactionId: result.ledgerTransactionId, status: 'applied' };
    // A Blnk QUEUED/INFLIGHT response is not a successful reconciliation and
    // must not create another transaction. Temporal keeps this wait durable.
    await sleep('1 minute');
  }
}
