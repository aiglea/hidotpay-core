export type WorkflowDispatcherConfig = {
  brokers: string[];
  groupId: string;
  healthHost: string;
  healthPort: number;
  taskQueue: string;
  temporalAddress: string;
  temporalNamespace: string;
  topic: string;
};

export function loadWorkflowDispatcherConfig(env: NodeJS.ProcessEnv): WorkflowDispatcherConfig {
  const brokers = required(env.KAFKA_BROKERS, 'KAFKA_BROKERS').split(',').map((value) => value.trim());
  if (brokers.length === 0 || brokers.some((broker) => !/^[A-Za-z0-9._:-]{3,253}$/.test(broker))) throw new Error('KAFKA_BROKERS is invalid');
  const groupId = required(env.WORKFLOW_CONSUMER_GROUP, 'WORKFLOW_CONSUMER_GROUP');
  const taskQueue = required(env.TEMPORAL_TASK_QUEUE, 'TEMPORAL_TASK_QUEUE');
  const temporalAddress = required(env.TEMPORAL_ADDRESS, 'TEMPORAL_ADDRESS');
  const temporalNamespace = env.TEMPORAL_NAMESPACE ?? 'default';
  const topic = env.KAFKA_TOPIC ?? 'hidotpay.events.v1';
  const healthHost = env.WORKFLOW_HEALTH_HOST ?? '0.0.0.0';
  const healthPort = env.WORKFLOW_HEALTH_PORT === undefined ? 8080 : parsePort(env.WORKFLOW_HEALTH_PORT);
  for (const [name, value] of Object.entries({ WORKFLOW_CONSUMER_GROUP: groupId, TEMPORAL_TASK_QUEUE: taskQueue, TEMPORAL_NAMESPACE: temporalNamespace, KAFKA_TOPIC: topic })) {
    if (!/^[A-Za-z0-9._-]{3,249}$/.test(value)) throw new Error(`${name} is invalid`);
  }
  if (!/^[A-Za-z0-9._:-]{3,253}$/.test(temporalAddress)) throw new Error('TEMPORAL_ADDRESS is invalid');
  if (healthHost !== '0.0.0.0' && healthHost !== '127.0.0.1' && healthHost !== '::1') throw new Error('WORKFLOW_HEALTH_HOST is invalid');
  return { brokers, groupId, healthHost, healthPort, taskQueue, temporalAddress, temporalNamespace, topic };
}

function parsePort(value: string): number {
  if (!/^[1-9][0-9]{0,4}$/.test(value)) throw new Error('WORKFLOW_HEALTH_PORT is invalid');
  const port = Number(value);
  if (port > 65535) throw new Error('WORKFLOW_HEALTH_PORT is invalid');
  return port;
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required`);
  return value;
}
