type FinancialEventStarter = {
  startApprovedWithdrawal(input: { aggregateId: string; eventId: string }): Promise<void>;
  startReconciliation(input: { eventId: string; ledgerTransactionId: string }): Promise<void>;
};

type RedpandaEvent = {
  aggregate_id: string;
  event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  schema_version: number;
};

export class RedpandaWorkflowDispatcher {
  public constructor(private readonly starter: FinancialEventStarter) {}

  /**
   * Redpanda is at-least-once. The starter uses the event's immutable aggregate
   * id as a non-reusable Temporal workflow id, so a duplicate delivery cannot
   * create a second financial action.
   */
  public async consume(rawMessage: string): Promise<{ status: 'dispatched' | 'ignored' }> {
    const event = parseEvent(rawMessage);
    if (event.event_type === 'deposit.credited') {
      const ledgerTransactionId = event.payload.ledger_transaction_id;
      if (!validId(ledgerTransactionId)) throw new Error('deposit.credited ledger_transaction_id is invalid');
      // The immutable Cockroach entry already credited the user before this
      // outbox event exists. This path can only reconcile its Blnk reference.
      await this.starter.startReconciliation({ eventId: event.event_id, ledgerTransactionId });
      return { status: 'dispatched' };
    }
    if (event.event_type === 'withdrawal.approved') {
      await this.starter.startApprovedWithdrawal({ aggregateId: event.aggregate_id, eventId: event.event_id });
      return { status: 'dispatched' };
    }
    return { status: 'ignored' };
  }
}

function parseEvent(rawMessage: string): RedpandaEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawMessage);
  } catch {
    throw new Error('invalid Redpanda event');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid Redpanda event');
  const event = parsed as Partial<RedpandaEvent>;
  if (
    !validId(event.aggregate_id)
    || !validId(event.event_id)
    || typeof event.event_type !== 'string'
    || event.event_type.length === 0
    || event.schema_version !== 1
    || !event.payload
    || typeof event.payload !== 'object'
    || Array.isArray(event.payload)
  ) throw new Error('invalid Redpanda event');
  return event as RedpandaEvent;
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(value);
}
