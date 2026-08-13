export type Environment = 'development' | 'production' | 'test';

export type AppConfig = {
  databaseUrl?: string;
  developmentApiKey?: string;
  environment: Environment;
  host: string;
  logtoAudience?: string;
  logtoIssuer?: string;
  port: number;
  withdrawalFeeSchedule: Record<string, string>;
};

function parseEnvironment(value: string | undefined): Environment {
  if (value === 'production' || value === 'test') return value;
  return 'development';
}

function parsePort(value: string | undefined): number {
  if (value === undefined) return 3001;
  if (!/^[1-9][0-9]{0,4}$/.test(value)) throw new Error('PORT must be a valid TCP port');
  const port = Number(value);
  if (port > 65535) throw new Error('PORT must be a valid TCP port');
  return port;
}

function parseHost(value: string | undefined, environment: Environment): string {
  if (value === undefined) return environment === 'production' ? '0.0.0.0' : '127.0.0.1';
  if (!/^[A-Za-z0-9.:_-]{1,253}$/.test(value)) throw new Error('HOST must be a hostname or IP address');
  return value;
}

function parseWithdrawalFeeSchedule(value: string | undefined): Record<string, string> {
  if (!value) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('WITHDRAWAL_FEE_SCHEDULE must be JSON');
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('WITHDRAWAL_FEE_SCHEDULE must be a JSON object');
  for (const [key, amount] of Object.entries(parsed)) {
    if (!/^[A-Za-z0-9._:-]{2,80}$/.test(key) || typeof amount !== 'string' || !/^[0-9]+$/.test(amount)) {
      throw new Error('WITHDRAWAL_FEE_SCHEDULE has an invalid fee');
    }
  }
  return parsed as Record<string, string>;
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const environment = parseEnvironment(env.NODE_ENV);
  const databaseUrl = env.DATABASE_URL;
  const developmentApiKey = env.DEVELOPMENT_API_KEY;
  const logtoAudience = env.LOGTO_AUDIENCE;
  const logtoIssuer = env.LOGTO_ISSUER;
  const withdrawalFeeSchedule = parseWithdrawalFeeSchedule(env.WITHDRAWAL_FEE_SCHEDULE);

  if (environment === 'production' && (!databaseUrl || !logtoAudience || !logtoIssuer || Object.keys(withdrawalFeeSchedule).length === 0)) {
    throw new Error('production requires DATABASE_URL, Logto configuration, and WITHDRAWAL_FEE_SCHEDULE');
  }

  return {
    databaseUrl,
    developmentApiKey,
    environment,
    host: parseHost(env.HOST, environment),
    logtoAudience,
    logtoIssuer,
    port: parsePort(env.PORT),
    withdrawalFeeSchedule,
  };
}
