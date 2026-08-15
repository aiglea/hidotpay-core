export type Environment = 'development' | 'production' | 'test';

export type AppConfig = {
  databaseUrl?: string;
  developmentApiKey?: string;
  environment: Environment;
  host: string;
  logtoAudience?: string;
  logtoIssuer?: string;
  port: number;
  p2pPaymentTimeoutMs: number;
  signerDerivationUrl?: string;
  signerServiceToken?: string;
  withdrawalFeeSchedule: Record<string, string>;
  withdrawalsEnabled: boolean;
  withdrawalRiskControls: {
    dailyLimitAtoms: string;
    maxPerWithdrawalAtoms: string;
    whitelistCooldownMs: number;
  };
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

function parseWithdrawalsEnabled(value: string | undefined): boolean {
  if (value === undefined) return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('WITHDRAWALS_ENABLED must be true or false');
}

function parsePositiveAtomConfig(value: string | undefined, name: string, fallback: string): string {
  const parsed = value ?? fallback;
  if (!/^[1-9][0-9]*$/.test(parsed)) throw new Error(`${name} must be a positive atom amount`);
  return parsed;
}

function parseP2PPaymentTimeout(value: string | undefined): number {
  const seconds = value ?? '900';
  if (!/^[0-9]{1,5}$/.test(seconds) || Number(seconds) < 60 || Number(seconds) > 86_400) {
    throw new Error('P2P_PAYMENT_TIMEOUT_SECONDS must be between 60 and 86400');
  }
  return Number(seconds) * 1_000;
}

function parseRiskControls(env: NodeJS.ProcessEnv, requireExplicit: boolean): AppConfig['withdrawalRiskControls'] {
  if (requireExplicit && (!env.WITHDRAWAL_DAILY_LIMIT_ATOMS || !env.WITHDRAWAL_MAX_PER_WITHDRAWAL_ATOMS || env.WITHDRAWAL_WHITELIST_COOLDOWN_SECONDS === undefined)) {
    throw new Error('enabling withdrawals requires explicit withdrawal risk limits and whitelist cooldown');
  }
  const cooldownSeconds = env.WITHDRAWAL_WHITELIST_COOLDOWN_SECONDS ?? '86400';
  if (!/^[0-9]{1,9}$/.test(cooldownSeconds) || Number(cooldownSeconds) > 31_536_000) {
    throw new Error('WITHDRAWAL_WHITELIST_COOLDOWN_SECONDS must be between 0 and 31536000');
  }
  return {
    dailyLimitAtoms: parsePositiveAtomConfig(env.WITHDRAWAL_DAILY_LIMIT_ATOMS, 'WITHDRAWAL_DAILY_LIMIT_ATOMS', '1000000000000'),
    maxPerWithdrawalAtoms: parsePositiveAtomConfig(env.WITHDRAWAL_MAX_PER_WITHDRAWAL_ATOMS, 'WITHDRAWAL_MAX_PER_WITHDRAWAL_ATOMS', '1000000000000'),
    whitelistCooldownMs: Number(cooldownSeconds) * 1000,
  };
}

function parseSignerDerivationUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('SIGNER_DERIVATION_URL must be a valid URL');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) throw new Error('SIGNER_DERIVATION_URL must use https without credentials or fragments');
  return parsed.toString();
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const environment = parseEnvironment(env.NODE_ENV);
  const databaseUrl = env.DATABASE_URL;
  const developmentApiKey = env.DEVELOPMENT_API_KEY;
  const logtoAudience = env.LOGTO_AUDIENCE;
  const logtoIssuer = env.LOGTO_ISSUER;
  const withdrawalFeeSchedule = parseWithdrawalFeeSchedule(env.WITHDRAWAL_FEE_SCHEDULE);
  const withdrawalsEnabled = parseWithdrawalsEnabled(env.WITHDRAWALS_ENABLED);
  const withdrawalRiskControls = parseRiskControls(env, withdrawalsEnabled);
  const p2pPaymentTimeoutMs = parseP2PPaymentTimeout(env.P2P_PAYMENT_TIMEOUT_SECONDS);
  const signerDerivationUrl = parseSignerDerivationUrl(env.SIGNER_DERIVATION_URL);
  const signerServiceToken = env.SIGNER_SERVICE_TOKEN;

  if (environment !== 'test' && (!databaseUrl || !logtoAudience || !logtoIssuer || Object.keys(withdrawalFeeSchedule).length === 0)) {
    throw new Error('running API requires DATABASE_URL, Logto configuration, and WITHDRAWAL_FEE_SCHEDULE');
  }
  if (environment !== 'test' && (!signerDerivationUrl || !signerServiceToken || signerServiceToken.length < 16)) {
    throw new Error('running API requires a private signer derivation endpoint and service credential');
  }

  return {
    databaseUrl,
    developmentApiKey,
    environment,
    host: parseHost(env.HOST, environment),
    logtoAudience,
    logtoIssuer,
    port: parsePort(env.PORT),
    p2pPaymentTimeoutMs,
    signerDerivationUrl,
    signerServiceToken,
    withdrawalFeeSchedule,
    withdrawalsEnabled,
    withdrawalRiskControls,
  };
}
