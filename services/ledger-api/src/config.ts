export type Environment = 'development' | 'production' | 'test';

export type AppConfig = {
  databaseUrl?: string;
  environment: Environment;
  logtoAudience?: string;
  logtoIssuer?: string;
  port: number;
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

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const environment = parseEnvironment(env.NODE_ENV);
  const databaseUrl = env.DATABASE_URL;
  const logtoAudience = env.LOGTO_AUDIENCE;
  const logtoIssuer = env.LOGTO_ISSUER;

  if (environment === 'production' && (!databaseUrl || !logtoAudience || !logtoIssuer)) {
    throw new Error('production requires DATABASE_URL and LOGTO_AUDIENCE');
  }

  return {
    databaseUrl,
    environment,
    logtoAudience,
    logtoIssuer,
    port: parsePort(env.PORT),
  };
}
