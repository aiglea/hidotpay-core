export type OutboxEvent = {
  aggregateId: string;
  attempts: number;
  eventType: string;
  id: string;
  payload: Record<string, unknown>;
};

export interface OutboxStore {
  claim(owner: string, limit: number): Promise<OutboxEvent[]>;
  markPublished(id: string, owner: string): Promise<void>;
  release(id: string, owner: string, error: string): Promise<void>;
}

export interface EventProducer {
  publish(event: OutboxEvent): Promise<void>;
}

export class OutboxPublisher {
  public constructor(private readonly store: OutboxStore, private readonly producer: EventProducer) {}

  public async publishBatch(owner: string, limit: number): Promise<{ failed: number; published: number }> {
    if (!owner || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error('invalid outbox publish batch');
    const events = await this.store.claim(owner, limit);
    let failed = 0;
    let published = 0;
    for (const event of events) {
      try {
        await this.producer.publish(event);
        await this.store.markPublished(event.id, owner);
        published += 1;
      } catch (error) {
        await this.store.release(event.id, owner, error instanceof Error ? error.message.slice(0, 512) : 'broker publish failed');
        failed += 1;
      }
    }
    return { failed, published };
  }
}

type Stored = OutboxEvent & { claimedBy?: string; lastError?: string; publishedAt?: Date };

export class InMemoryOutboxStore implements OutboxStore {
  private readonly events = new Map<string, Stored>();

  public constructor(events: Array<Omit<OutboxEvent, 'attempts'>>) {
    for (const event of events) this.events.set(event.id, { ...event, attempts: 0 });
  }

  public async claim(owner: string, limit: number): Promise<OutboxEvent[]> {
    return [...this.events.values()]
      .filter((event) => !event.publishedAt && !event.claimedBy)
      .slice(0, limit)
      .map((event) => {
        event.claimedBy = owner;
        return { aggregateId: event.aggregateId, attempts: event.attempts, eventType: event.eventType, id: event.id, payload: { ...event.payload } };
      });
  }

  public async markPublished(id: string, owner: string): Promise<void> {
    const event = this.requireClaim(id, owner);
    event.publishedAt = new Date();
    event.claimedBy = undefined;
  }

  public async release(id: string, owner: string, error: string): Promise<void> {
    const event = this.requireClaim(id, owner);
    event.attempts += 1;
    event.lastError = error;
    event.claimedBy = undefined;
  }

  public event(id: string): Stored | undefined {
    const event = this.events.get(id);
    return event ? { ...event, payload: { ...event.payload } } : undefined;
  }

  private requireClaim(id: string, owner: string): Stored {
    const event = this.events.get(id);
    if (!event || event.claimedBy !== owner) throw new Error('outbox event not claimed by publisher');
    return event;
  }
}
