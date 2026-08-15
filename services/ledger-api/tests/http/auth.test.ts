import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { exportJWK, generateKeyPair, SignJWT } from 'jose';

import { createAuthenticator } from '../../src/http/auth.js';
import { DomainError } from '../../src/domain/errors.js';

async function startOidcServer() {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-key';
  jwk.use = 'sig';
  jwk.alg = 'RS256';

  const server = createServer((request, response) => {
    const origin = `http://${request.headers.host}`;
    if (request.url === '/oidc/.well-known/openid-configuration') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ issuer: `${origin}/oidc`, jwks_uri: `${origin}/oidc/jwks` }));
      return;
    }
    if (request.url === '/oidc/jwks') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test OIDC server did not bind');
  const issuer = `http://127.0.0.1:${address.port}/oidc`;

  return {
    async close() { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); },
    issuer,
    async token(payload: Record<string, unknown>) {
      return new SignJWT(payload)
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
    },
  };
}

test('only the isolated test environment accepts test actor headers', async () => {
  const authenticate = createAuthenticator({
    environment: 'development',
    host: '127.0.0.1',
    port: 3001,
    withdrawalFeeSchedule: {},
  });

  await assert.rejects(
    () => authenticate({ 'x-actor-id': 'forged-user', 'x-actor-roles': 'chain_worker' }),
    (error: unknown) => error instanceof DomainError && error.code === 'unauthenticated',
  );
});

test('production authenticator defers OIDC discovery until a bearer token is supplied', async (t) => {
  const originalFetch = globalThis.fetch;
  let discoveryRequests = 0;
  globalThis.fetch = async () => {
    discoveryRequests += 1;
    throw new Error('issuer is unreachable');
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const authenticate = createAuthenticator({
    environment: 'production',
    host: '0.0.0.0',
    logtoAudience: 'https://api.hidotpay.example',
    logtoIssuer: 'https://unreachable-issuer.hidotpay.example/oidc',
    port: 3001,
    withdrawalFeeSchedule: {},
    withdrawalsEnabled: false,
    withdrawalRiskControls: {
      dailyLimitAtoms: '1',
      maxPerWithdrawalAtoms: '1',
      whitelistCooldownMs: 0,
    },
  });

  await Promise.resolve();
  assert.equal(discoveryRequests, 0);
  await assert.rejects(
    () => authenticate({}),
    (error: unknown) => error instanceof DomainError && error.code === 'unauthenticated',
  );
  assert.equal(discoveryRequests, 0);
  await assert.rejects(
    () => authenticate({ authorization: 'Bearer header.payload.signature' }),
    (error: unknown) => error instanceof DomainError && error.code === 'unauthenticated',
  );
  assert.equal(discoveryRequests, 1);
});

test('Logto access token requires the configured issuer and audience', async (t) => {
  const oidc = await startOidcServer();
  t.after(() => oidc.close());
  const authenticate = createAuthenticator({
    environment: 'development',
    host: '127.0.0.1',
    logtoAudience: 'https://api-dev.hidotpay.com',
    logtoIssuer: oidc.issuer,
    port: 3001,
    withdrawalFeeSchedule: {},
  });
  const validToken = await oidc.token({ aud: 'https://api-dev.hidotpay.com', iss: oidc.issuer, scope: 'wallet:read wallet:write', sub: 'logto-user-01' });
  const actor = await authenticate({ authorization: `Bearer ${validToken}` });
  assert.deepEqual(actor, { id: 'logto-user-01', roles: ['wallet:read', 'wallet:write'] });

  const wrongAudience = await oidc.token({ aud: 'https://wrong.example', iss: oidc.issuer, sub: 'logto-user-01' });
  await assert.rejects(
    () => authenticate({ authorization: `Bearer ${wrongAudience}` }),
    (error: unknown) => error instanceof DomainError && error.code === 'unauthenticated',
  );
});
