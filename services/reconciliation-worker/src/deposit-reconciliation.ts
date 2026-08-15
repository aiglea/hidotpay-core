export type PendingDeposit = {
  amountAtoms: string;
  assetCode: string;
  blnkReference?: string;
  destinationAccountId: string;
  id: string;
  ledgerTransactionId: string;
  precision: string;
};

export type BlnkResult = { blnkTransactionId: string; status: string };

export interface BlnkDepositLedger {
  findTransactionByReference(reference: string): Promise<BlnkResult>;
  recordDepositCredit(input: Omit<PendingDeposit, 'blnkReference' | 'id'>): Promise<BlnkResult>;
}

export interface DepositReconciliationStore {
  claimPending(limit: number): Promise<PendingDeposit[]>;
  claimPendingByLedgerTransactionId(ledgerTransactionId: string): Promise<PendingDeposit | undefined>;
  recordFailure(id: string, error: string): Promise<void>;
  recordResult(input: { blnkReference: string; blnkTransactionId: string; id: string; reconciled: boolean; status: string }): Promise<void>;
}

export class DepositReconciliationWorker {
  public constructor(private readonly store: DepositReconciliationStore, private readonly blnk: BlnkDepositLedger) {}

  public async reconcileBatch(limit: number): Promise<{ applied: number; failed: number; queued: number }> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error('invalid reconciliation batch limit');
    let applied = 0;
    let failed = 0;
    let queued = 0;
    for (const deposit of await this.store.claimPending(limit)) {
      try {
        if (await this.reconcile(deposit) === 'applied') applied += 1;
        else queued += 1;
      } catch (error) {
        await this.store.recordFailure(deposit.id, boundedError(error));
        failed += 1;
      }
    }
    return { applied, failed, queued };
  }

  /**
   * Used by the credited-deposit Temporal workflow. A missing row is already
   * reconciled (or was safely removed), so replaying an outbox event is a no-op.
   */
  public async reconcileLedgerTransaction(ledgerTransactionId: string): Promise<{ ledgerTransactionId: string; status: 'applied' | 'queued' }> {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(ledgerTransactionId)) throw new Error('invalid ledger transaction id');
    const deposit = await this.store.claimPendingByLedgerTransactionId(ledgerTransactionId);
    if (!deposit) return { ledgerTransactionId, status: 'applied' };
    try {
      return { ledgerTransactionId, status: await this.reconcile(deposit) };
    } catch (error) {
      await this.store.recordFailure(deposit.id, boundedError(error));
      throw error;
    }
  }

  private async reconcile(deposit: PendingDeposit): Promise<'applied' | 'queued'> {
    const reference = deposit.blnkReference ?? `hidotpay:ledger:${deposit.ledgerTransactionId}`;
    const result = deposit.blnkReference
      ? await this.blnk.findTransactionByReference(reference)
      : await this.blnk.recordDepositCredit({
        amountAtoms: deposit.amountAtoms,
        assetCode: deposit.assetCode,
        destinationAccountId: deposit.destinationAccountId,
        ledgerTransactionId: deposit.ledgerTransactionId,
        precision: deposit.precision,
      });
    const reconciled = result.status === 'APPLIED';
    if (!reconciled && result.status !== 'QUEUED' && result.status !== 'INFLIGHT') throw new Error(`Blnk transaction is ${result.status}`);
    await this.store.recordResult({
      blnkReference: reference,
      blnkTransactionId: result.blnkTransactionId,
      id: deposit.id,
      reconciled,
      status: result.status,
    });
    return reconciled ? 'applied' : 'queued';
  }
}

type StoredDeposit = PendingDeposit & {
  blnkStatus?: string;
  blnkTransactionId?: string;
  lastError?: string;
  reconciled: boolean;
};

/** Test helper. Production uses a Cockroach-backed implementation. */
export class InMemoryDepositReconciliationStore implements DepositReconciliationStore {
  private readonly deposits = new Map<string, StoredDeposit>();

  public constructor(deposits: PendingDeposit[]) {
    for (const deposit of deposits) this.deposits.set(deposit.id, { ...deposit, reconciled: false });
  }

  public async claimPending(limit: number): Promise<PendingDeposit[]> {
    return [...this.deposits.values()]
      .filter((deposit) => !deposit.reconciled)
      .slice(0, limit)
      .map(({ blnkStatus: _blnkStatus, blnkTransactionId: _blnkTransactionId, lastError: _lastError, reconciled: _reconciled, ...deposit }) => ({ ...deposit }));
  }

  public async claimPendingByLedgerTransactionId(ledgerTransactionId: string): Promise<PendingDeposit | undefined> {
    return [...this.deposits.values()]
      .filter((deposit) => !deposit.reconciled && deposit.ledgerTransactionId === ledgerTransactionId)
      .slice(0, 1)
      .map(({ blnkStatus: _blnkStatus, blnkTransactionId: _blnkTransactionId, lastError: _lastError, reconciled: _reconciled, ...deposit }) => ({ ...deposit }))[0];
  }

  public async recordFailure(id: string, error: string): Promise<void> {
    const deposit = this.require(id);
    deposit.lastError = error;
  }

  public async recordResult(input: { blnkReference: string; blnkTransactionId: string; id: string; reconciled: boolean; status: string }): Promise<void> {
    const deposit = this.require(input.id);
    deposit.blnkReference = input.blnkReference;
    deposit.blnkStatus = input.status;
    deposit.blnkTransactionId = input.blnkTransactionId;
    deposit.lastError = undefined;
    deposit.reconciled = input.reconciled;
  }

  public deposit(id: string): StoredDeposit | undefined {
    const deposit = this.deposits.get(id);
    return deposit ? { ...deposit } : undefined;
  }

  private require(id: string): StoredDeposit {
    const deposit = this.deposits.get(id);
    if (!deposit) throw new Error('deposit is not in reconciliation store');
    return deposit;
  }
}

function boundedError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Blnk reconciliation failed';
  return message.replace(/[\r\n]/g, ' ').slice(0, 512);
}
