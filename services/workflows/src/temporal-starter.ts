import { workflowId } from './workflow-contract.js';

export type WorkflowStartClient = {
  start(workflowType: string, options: {
    args: unknown[];
    memo: Record<string, string>;
    taskQueue: string;
    workflowId: string;
    workflowIdConflictPolicy: 'USE_EXISTING';
    workflowIdReusePolicy: 'REJECT_DUPLICATE';
  }): Promise<unknown>;
};

export class TemporalWorkflowStarter {
  public constructor(private readonly client: WorkflowStartClient, private readonly taskQueue: string) {
    if (!/^[A-Za-z0-9._-]{3,249}$/.test(taskQueue)) throw new Error('Temporal task queue is invalid');
  }

  /** A credited deposit can only reconcile the immutable Cockroach transaction. */
  public async startReconciliation(input: { eventId: string; ledgerTransactionId: string }): Promise<void> {
    await this.start(
      'reconciliationWorkflow',
      { ledgerTransactionId: input.ledgerTransactionId },
      input.eventId,
      workflowId.reconciliation(input.ledgerTransactionId),
    );
  }

  public async startApprovedWithdrawal(input: { aggregateId: string; eventId: string }): Promise<void> {
    await this.start('withdrawalWorkflow', { withdrawalId: input.aggregateId }, input.eventId, workflowId.withdrawal(input.aggregateId));
  }

  private async start(workflowType: string, argument: Record<string, string>, eventId: string, id: string): Promise<void> {
    if (!validId(eventId)) throw new Error('outbox event id is invalid');
    await this.client.start(workflowType, {
      args: [argument],
      memo: { outbox_event_id: eventId },
      taskQueue: this.taskQueue,
      workflowId: id,
      workflowIdConflictPolicy: 'USE_EXISTING',
      workflowIdReusePolicy: 'REJECT_DUPLICATE',
    });
  }
}

function validId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(value);
}
