import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import type { AppConfig } from '../config.js';
import { DomainError } from '../domain/errors.js';

export type Actor = { id: string; roles: string[] };

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

export function createAuthenticator(config: AppConfig): (headers: Record<string, unknown>) => Promise<Actor> {
  if (config.environment !== 'production') {
    return async (headers) => {
      const actorId = headers['x-actor-id'];
      if (typeof actorId !== 'string' || !/^[A-Za-z0-9_-]{3,128}$/.test(actorId)) throw new DomainError('unauthenticated');
      const roleHeader = headers['x-actor-roles'];
      const roles = typeof roleHeader === 'string' ? roleHeader.split(',').map((role) => role.trim()).filter(Boolean) : [];
      return { id: actorId, roles };
    };
  }

  if (!config.logtoIssuer || !config.logtoAudience) throw new Error('production authentication is not configured');
  const jwks = discoverJwks(config.logtoIssuer);
  return async (headers) => {
    const token = bearerToken(typeof headers.authorization === 'string' ? headers.authorization : undefined);
    const { payload } = await jwtVerify(token, await jwks, {
      audience: config.logtoAudience,
      issuer: config.logtoIssuer,
    });
    return actorFromPayload(payload);
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
