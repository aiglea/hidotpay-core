import { createAuthenticator, type Actor } from '../../ledger-api/src/http/auth.js';
import { DomainError } from '../../ledger-api/src/domain/errors.js';

export type NativeLedgerAuthEnv = {
  LOGTO_AUDIENCE?: string;
  LOGTO_ISSUER?: string;
};

const authenticators = new Map<string, ReturnType<typeof createAuthenticator>>();

export async function authenticateNativeLedgerRequest(env: NativeLedgerAuthEnv, headers: Headers): Promise<Actor> {
  if (!env.LOGTO_ISSUER || !env.LOGTO_AUDIENCE) throw new DomainError('unauthenticated');
  const key = `${env.LOGTO_ISSUER}\u0000${env.LOGTO_AUDIENCE}`;
  let authenticate = authenticators.get(key);
  if (!authenticate) {
    authenticate = createAuthenticator({
      environment: 'production',
      logtoAudience: env.LOGTO_AUDIENCE,
      logtoIssuer: env.LOGTO_ISSUER,
    });
    authenticators.set(key, authenticate);
  }
  return authenticate(Object.fromEntries(headers.entries()));
}
