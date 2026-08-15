export type P2PPaymentExpiryRepository = {
  expireDue(limit: number): Promise<string[]>;
};

/**
 * This is intentionally the entire privilege surface of the scheduled worker:
 * it cannot create, release, or edit P2P orders.  The repository performs the
 * deadline check and balanced refund in one serializable database transaction.
 */
export async function runP2PPaymentExpiry(
  repository: P2PPaymentExpiryRepository,
  batchSize: number,
): Promise<{ expiredOrderIds: string[] }> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
    throw new Error('P2P expiry batch size must be between 1 and 1000');
  }
  return { expiredOrderIds: await repository.expireDue(batchSize) };
}
