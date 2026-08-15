type WorkflowDispatcher = {
  consume(rawMessage: string): Promise<{ status: 'dispatched' | 'ignored' }>;
};

type KafkaConsumer = {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  run(input: { eachMessage: (input: { message: { value: Buffer | null } }) => Promise<void> }): Promise<void>;
  subscribe(input: { fromBeginning: false; topic: string }): Promise<void>;
};

type KafkaClient = {
  consumer(options: { allowAutoTopicCreation: false; groupId: string }): KafkaConsumer;
};

export type KafkaWorkflowConsumerConfig = {
  brokers: string[];
  groupId: string;
  topic: string;
};

export type ManagedKafkaWorkflowConsumer = {
  close(): Promise<void>;
  start(): Promise<void>;
};

export function createManagedKafkaWorkflowConsumer(
  config: KafkaWorkflowConsumerConfig,
  kafka: KafkaClient,
  dispatcher: WorkflowDispatcher,
): ManagedKafkaWorkflowConsumer {
  if (config.brokers.length === 0 || config.brokers.some((broker) => !/^[A-Za-z0-9._:-]{3,253}$/.test(broker))) throw new Error('Kafka brokers are invalid');
  if (!/^[A-Za-z0-9._-]{3,249}$/.test(config.groupId)) throw new Error('Kafka consumer group is invalid');
  if (!/^[A-Za-z0-9._-]{3,249}$/.test(config.topic)) throw new Error('Kafka topic is invalid');
  const consumer = kafka.consumer({ allowAutoTopicCreation: false, groupId: config.groupId });
  let started = false;
  let closed = false;

  return {
    async start(): Promise<void> {
      if (closed) throw new Error('Kafka workflow consumer is closed');
      if (started) return;
      await consumer.connect();
      await consumer.subscribe({ fromBeginning: false, topic: config.topic });
      await consumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value) throw new Error('Redpanda event payload is empty');
          await dispatcher.consume(message.value.toString('utf8'));
        },
      });
      started = true;
    },
    async close(): Promise<void> {
      if (!started || closed) return;
      closed = true;
      await consumer.disconnect();
    },
  };
}

/** Creates the KafkaJS client used for Redpanda's Kafka-compatible protocol. */
export function createKafkaJsWorkflowConsumer(
  config: KafkaWorkflowConsumerConfig,
  dispatcher: WorkflowDispatcher,
  client: KafkaClient = kafkaJsClient(config),
): ManagedKafkaWorkflowConsumer {
  return createManagedKafkaWorkflowConsumer(config, client, dispatcher);
}

function kafkaJsClient(config: KafkaWorkflowConsumerConfig): KafkaClient {
  const kafka = new Kafka({
    brokers: config.brokers,
    clientId: 'hidotpay-workflow-consumer',
  });
  return {
    consumer(options): KafkaConsumer {
      const consumer = kafka.consumer(options);
      return {
        connect: () => consumer.connect(),
        disconnect: () => consumer.disconnect(),
        run: async ({ eachMessage }) => consumer.run({
          eachMessage: async ({ message }) => eachMessage({ message: { value: message.value } }),
        }),
        subscribe: (input) => consumer.subscribe(input),
      };
    },
  };
}
import { Kafka } from 'kafkajs';
