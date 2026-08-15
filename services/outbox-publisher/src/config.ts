export type OutboxPublisherConfig = {
  batchSize: number;
  brokers: string[];
  databaseUrl: string;
  healthHost: string;
  healthPort: number;
  pollIntervalMs: number;
  publisherId: string;
  topic: string;
};

export function loadOutboxPublisherConfig(env: NodeJS.ProcessEnv): OutboxPublisherConfig {
  const databaseUrl = required(env.DATABASE_URL, 'DATABASE_URL');
  const brokers = required(env.KAFKA_BROKERS, 'KAFKA_BROKERS').split(',').map((value) => value.trim());
  const publisherId = env.OUTBOX_PUBLISHER_ID ?? `outbox-${process.pid}`;
  const topic = env.KAFKA_TOPIC ?? 'hidotpay.events.v1';
  const healthHost = env.OUTBOX_HEALTH_HOST ?? '0.0.0.0';
  const healthPort = env.OUTBOX_HEALTH_PORT === undefined ? 8080 : parsePort(env.OUTBOX_HEALTH_PORT, 'OUTBOX_HEALTH_PORT');
  const batchSize = env.OUTBOX_BATCH_SIZE === undefined ? 100 : parseRange(env.OUTBOX_BATCH_SIZE, 'OUTBOX_BATCH_SIZE', 1, 500);
  const pollIntervalMs = env.OUTBOX_POLL_INTERVAL_MS === undefined ? 1000 : parseRange(env.OUTBOX_POLL_INTERVAL_MS, 'OUTBOX_POLL_INTERVAL_MS', 100, 60_000);
  if (brokers.length === 0 || brokers.some((broker) => !/^[A-Za-z0-9._:-]{3,253}$/.test(broker))) throw new Error('KAFKA_BROKERS is invalid');
  if (!/^[A-Za-z0-9._:-]{3,128}$/.test(publisherId)) throw new Error('OUTBOX_PUBLISHER_ID is invalid');
  if (!/^[A-Za-z0-9._-]{3,249}$/.test(topic)) throw new Error('KAFKA_TOPIC is invalid');
  if (healthHost !== '0.0.0.0' && healthHost !== '127.0.0.1' && healthHost !== '::1') throw new Error('OUTBOX_HEALTH_HOST is invalid');
  return { batchSize, brokers, databaseUrl, healthHost, healthPort, pollIntervalMs, publisherId, topic };
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseRange(value: string, name: string, minimum: number, maximum: number): number {
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  return number;
}

function parsePort(value: string, name: string): number {
  const port = parseRange(value, name, 1, 65_535);
  return port;
}
