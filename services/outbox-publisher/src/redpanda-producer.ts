import type { EventProducer, OutboxEvent } from './publisher.js';

export type KafkaCompatibleProducer = {
  send(input: {
    acks: -1;
    messages: Array<{ headers: Record<string, string>; key: string; value: string }>;
    topic: string;
  }): Promise<unknown>;
};

/**
 * Redpanda speaks the Kafka protocol. The outbox id is both the Kafka key and
 * consumer de-duplication id, while the DB lease remains the source of retry.
 */
export class RedpandaEventProducer implements EventProducer {
  public constructor(private readonly producer: KafkaCompatibleProducer, private readonly topic: string) {
    if (!/^[A-Za-z0-9._-]{3,249}$/.test(topic)) throw new Error('Redpanda topic is invalid');
  }

  public async publish(event: OutboxEvent): Promise<void> {
    await this.producer.send({
      acks: -1,
      messages: [{
        headers: { 'event-type': event.eventType, 'schema-version': '1' },
        key: event.id,
        value: JSON.stringify({
          aggregate_id: event.aggregateId,
          event_id: event.id,
          event_type: event.eventType,
          payload: event.payload,
          schema_version: 1,
        }),
      }],
      topic: this.topic,
    });
  }
}
