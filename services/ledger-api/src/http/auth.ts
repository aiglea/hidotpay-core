import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import { DomainError } from '../domain/errors.js';

export type Actor = { id: string; roles: string[] };
export type AuthenticationConfig = {
  developmentApiKey?: string;
  environment: 'development' | 'production' | 'test';
  logtoAudience?: string;
  logtoIssuer?: string;
};

function bearerToken(authorization: string | undefined): string {
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization ?? '');
  if (!match?.[1]) throw new DomainError('unauthenticated');
  return match[1];
}

async function discoverJwks(issuer: string): Promise<ReturnType<typeof createRemoteJWKSet>> {
  const discoveryUrl = new URL('.well-known/openid-configuration', issuer.endsWith('/') ? issuer : `${issuer}/`);
  const response = await fetch(discoveryUrl);
  if (!response.ok) throw new DomainError('authentication_unavailable');
  const discovery = await response.json() as { jwks_uri?: string };
  if (!discovery.jwks_uri) throw new DomainError('authentication_unavailable');
  return createRemoteJWKSet(new URL(discovery.jwks_uri));
}

export function createAuthenticator(config: AuthenticationConfig): (headers: Record<string, unknown>) => Promise<Actor> {
  // Test identities must never be accepted by a running development or production API.
  // They exist solely so unit tests can exercise authorization without contacting Logto.
  if (config.environment === 'test') {
    return async (headers) => {
      if (config.developmentApiKey) {
        const provided = headers['x-hidotpay-dev-key'];
        if (provided !== config.developmentApiKey) throw new DomainError('unauthenticated');
      }
      const actorId = headers['x-actor-id'];
      if (typeof actorId !== 'string' || !/^[A-Za-z0-9_-]{3,128}$/.test(actorId)) throw new DomainError('unauthenticated');
      const roleHeader = headers['x-actor-roles'];
      const roles = typeof roleHeader === 'string' ? roleHeader.split(',').map((role) => role.trim()).filter(Boolean) : [];
      return { id: actorId, roles };
    };
  }

  if (!config.logtoIssuer || !config.logtoAudience) {
    return async () => { throw new DomainError('unauthenticated'); };
  }
  let jwks: Promise<ReturnType<typeof createRemoteJWKSet>> | undefined;
  const getJwks = () => (jwks ??= discoverJwks(config.logtoIssuer!));
  return async (headers) => {
    try {
      const token = bearerToken(typeof headers.authorization === 'string' ? headers.authorization : undefined);
      const { payload } = await jwtVerify(token, await getJwks(), {
        audience: config.logtoAudience,
        issuer: config.logtoIssuer,
      });
      return actorFromPayload(payload);
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError('unauthenticated');
    }
  };
}

function actorFromPayload(payload: JWTPayload): Actor {
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) throw new DomainError('unauthenticated');
  const roles = Array.isArray(payload.roles)
    ? payload.roles.filter((role): role is string => typeof role === 'string')
    : typeof payload.scope === 'string' ? payload.scope.split(' ') : [];
  return { id: payload.sub, roles };
}

export function requireRole(actor: Actor, role: string): void {
  if (!actor.roles.includes(role)) throw new DomainError('forbidden');
}
