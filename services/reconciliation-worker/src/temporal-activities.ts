export type LedgerTransactionReconciler = {
  reconcileLedgerTransaction(ledgerTransactionId: string): Promise<{
    ledgerTransactionId: string;
    status: 'applied' | 'queued';
  }>;
};

/**
 * Keeps Temporal's public activity surface narrow: the activity receives one
 * immutable Cockroach ledger transaction ID and delegates all money movement
 * and Blnk idempotency to the reconciliation worker.
 */
export function createReconciliationTemporalActivities(reconciler: LedgerTransactionReconciler): {
  reconcileLedger(input: { ledgerTransactionId: string }): Promise<{ ledgerTransactionId: string; status: 'applied' | 'queued' }>;
} {
  return {
    reconcileLedger: async (input) => reconciler.reconcileLedgerTransaction(input.ledgerTransactionId),
  };
}
