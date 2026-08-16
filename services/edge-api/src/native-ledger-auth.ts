import { timingSafeEqual } from 'node:crypto';

import { createAuthenticator, type Actor } from '../../ledger-api/src/http/auth.js';
import { DomainError } from '../../ledger-api/src/domain/errors.js';

export type NativeLedgerAuthEnv = {
  CHAIN_OPERATOR_TOKEN?: string;
  LOGTO_AUDIENCE?: string;
  LOGTO_ISSUER?: string;
};

const CHAIN_OPERATOR: Actor = { id: 'chain-operator', roles: ['chain_worker'] };

export function authenticateChainOperator(env: Pick<NativeLedgerAuthEnv, 'CHAIN_OPERATOR_TOKEN'>, headers: Headers): Actor {
  const configured = env.CHAIN_OPERATOR_TOKEN;
  if (!configured || configured.length < 16) throw new DomainError('chain_operator_unavailable');
  if (headers.get('x-actor-id') || headers.get('x-actor-roles')) throw new DomainError('unauthenticated');
  const authorization = headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw new DomainError('unauthenticated');
  const supplied = Buffer.from(authorization.slice('Bearer '.length));
  const expected = Buffer.from(configured);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new DomainError('unauthenticated');
  return { ...CHAIN_OPERATOR };
}

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
