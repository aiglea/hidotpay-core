import { Kafka } from 'kafkajs';

import type { EventProducer, OutboxEvent } from './publisher.js';
import { RedpandaEventProducer, type KafkaCompatibleProducer } from './redpanda-producer.js';

type KafkaClient = {
  producer(options: { allowAutoTopicCreation: false; idempotent: true; maxInFlightRequests: 1 }): KafkaCompatibleProducer & {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
  };
};

export type KafkaProducerConfig = {
  brokers: string[];
  clientId: string;
  topic: string;
};

export type ManagedEventProducer = EventProducer & { close(): Promise<void>; connect(): Promise<void> };

export function createKafkaJsClient(config: Omit<KafkaProducerConfig, 'topic'>): KafkaClient {
  if (config.brokers.length === 0 || config.brokers.some((broker) => !/^[A-Za-z0-9._:-]{3,253}$/.test(broker))) throw new Error('Kafka brokers are invalid');
  if (!/^[A-Za-z0-9._:-]{3,128}$/.test(config.clientId)) throw new Error('Kafka client id is invalid');
  return new Kafka({ brokers: config.brokers, clientId: config.clientId });
}

export function createManagedKafkaProducer(config: KafkaProducerConfig, kafka: KafkaClient): ManagedEventProducer {
  // Topic creation is prohibited both here and by the Redpanda broker config.
  const producer = kafka.producer({ allowAutoTopicCreation: false, idempotent: true, maxInFlightRequests: 1 });
  const events = new RedpandaEventProducer(producer, config.topic);
  let connected = false;
  let closed = false;

  const connect = async (): Promise<void> => {
    if (closed) throw new Error('Kafka producer is closed');
    if (!connected) {
      await producer.connect();
      connected = true;
    }
  };

  return {
    connect,
    async publish(event: OutboxEvent): Promise<void> {
      await connect();
      await events.publish(event);
    },
    async close(): Promise<void> {
      if (!connected || closed) return;
      closed = true;
      await producer.disconnect();
    },
  };
}
