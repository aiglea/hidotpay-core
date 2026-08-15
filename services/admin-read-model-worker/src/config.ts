export type AdminReadModelConfig = {
  nocoBaseToken: string;
  nocoBaseUrl: string;
  sourceDatabaseUrl: string;
};

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv): AdminReadModelConfig {
  const sourceDatabaseUrl = required(env, 'ADMIN_READ_MODEL_SOURCE_DATABASE_URL');
  const source = new URL(sourceDatabaseUrl);
  if (source.username !== 'hidotpay_nocobase_reader') throw new Error('ADMIN_READ_MODEL_SOURCE_DATABASE_URL must use hidotpay_nocobase_reader');

  const nocoBaseUrl = required(env, 'NOCOBASE_URL').replace(/\/$/, '');
  const nocoBase = new URL(nocoBaseUrl);
  if (env.NODE_ENV === 'production' && nocoBase.protocol !== 'https:') throw new Error('NOCOBASE_URL must use HTTPS in production');

  return {
    nocoBaseToken: required(env, 'NOCOBASE_API_TOKEN'),
    nocoBaseUrl,
    sourceDatabaseUrl,
  };
}
