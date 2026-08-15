import { Container } from '@cloudflare/containers';
import { env } from 'cloudflare:workers';

type LedgerRuntimeEnv = {
  ALLOWED_EGRESS_HOSTS: string;
  BLNK_BASE_URL: string;
  DATABASE_URL: string;
  LOGTO_AUDIENCE: string;
  LOGTO_ISSUER: string;
  OPENBAO_TRANSIT_TOKEN: string;
  OPENBAO_TRANSIT_URL: string;
  SIGNER_DERIVATION_URL: string;
  SIGNER_SERVICE_TOKEN: string;
  WITHDRAWALS_ENABLED: string;
  WITHDRAWAL_FEE_SCHEDULE: string;
};

const runtimeEnv = env as unknown as LedgerRuntimeEnv;

function requiredAllowedHosts(value: string): string[] {
  const hosts = value.split(',').map((host) => host.trim()).filter(Boolean);
  if (hosts.length === 0) throw new Error('ALLOWED_EGRESS_HOSTS must contain at least one host');
  return hosts;
}

export class LedgerContainer extends Container {
  defaultPort = 3001;
  sleepAfter = '5m';
  enableInternet = false;
  interceptHttps = true;
  allowedHosts = requiredAllowedHosts(runtimeEnv.ALLOWED_EGRESS_HOSTS);
  entrypoint = [
    'sh',
    '-lc',
    [
      'test -r /etc/cloudflare/certs/cloudflare-containers-ca.crt',
      'cp /etc/cloudflare/certs/cloudflare-containers-ca.crt /usr/local/share/ca-certificates/cloudflare-containers-ca.crt',
      'update-ca-certificates',
      'exec node --enable-source-maps services/ledger-api/dist/server.js',
    ].join(' && '),
  ];
  envVars = {
    BLNK_BASE_URL: runtimeEnv.BLNK_BASE_URL,
    DATABASE_URL: runtimeEnv.DATABASE_URL,
    LOGTO_AUDIENCE: runtimeEnv.LOGTO_AUDIENCE,
    LOGTO_ISSUER: runtimeEnv.LOGTO_ISSUER,
    NODE_ENV: 'production',
    OPENBAO_TRANSIT_TOKEN: runtimeEnv.OPENBAO_TRANSIT_TOKEN,
    OPENBAO_TRANSIT_URL: runtimeEnv.OPENBAO_TRANSIT_URL,
    SIGNER_DERIVATION_URL: runtimeEnv.SIGNER_DERIVATION_URL,
    SIGNER_SERVICE_TOKEN: runtimeEnv.SIGNER_SERVICE_TOKEN,
    WITHDRAWALS_ENABLED: runtimeEnv.WITHDRAWALS_ENABLED,
    WITHDRAWAL_FEE_SCHEDULE: runtimeEnv.WITHDRAWAL_FEE_SCHEDULE,
  };

  static outbound = (request: Request) => fetch(request);
}
