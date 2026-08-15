import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('financial edge worker project', () => {
  it('places the ledger API in a Container and never binds a database to the Worker', async () => {
    const config = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
    assert.match(config, /"containers"/);
    assert.match(config, /"durable_objects"/);
    assert.match(config, /"name": "LEDGER_CONTAINER"/);
    assert.match(config, /"compatibility_date": "2026-08-14"/);
    assert.doesNotMatch(config, /"HYPERDRIVE"/);
    assert.doesNotMatch(config, /"DATABASE_URL"/);
    assert.doesNotMatch(config, /postgres(?:ql)?:\/\//i);
  });

  it('limits the public Worker to health and versioned API requests', async () => {
    const worker = await readFile(new URL('../src/edge-worker.ts', import.meta.url), 'utf8');
    const config = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
    assert.match(worker, /pathname === '\/healthz'/);
    assert.match(worker, /pathname\.startsWith\('\/v1\/'\)/);
    assert.match(config, /"LEDGER_API_ENABLED": "false"/);
    assert.match(config, /"max_instances": 1/);
    assert.match(worker, /LEDGER_API_ENABLED/);
    assert.match(worker, /new Response\('Service Unavailable', \{ status: 503 \}\)/);
    assert.match(worker, /getRandom\(env\.LEDGER_CONTAINER, 1\)/);
    assert.match(worker, /export \{ ContainerProxy \} from '@cloudflare\/containers'/);
    assert.match(worker, /request\.headers\.get\('authorization'\)/);
    assert.match(worker, /new Response\('Unauthorized', \{ status: 401 \}\)/);
    assert.match(worker, /new Response\('Not Found', \{ status: 404 \}\)/);
  });

  it('builds the ledger container without copying environment files or key material', async () => {
    const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8');
    assert.match(dockerfile, /FROM node:22\.19\.0-bookworm-slim/);
    assert.match(dockerfile, /ca-certificates/);
    assert.doesNotMatch(dockerfile, /\.env/);
    assert.doesNotMatch(dockerfile, /PRIVATE_KEY|MNEMONIC|SEED/i);
  });

  it('fails closed for every container egress protocol, including HTTPS', async () => {
    const container = await readFile(new URL('../src/ledger-container.ts', import.meta.url), 'utf8');
    assert.match(container, /enableInternet = false/);
    assert.match(container, /interceptHttps = true/);
    assert.match(container, /static outbound = \(request: Request\) => fetch\(request\)/);
    assert.match(container, /cloudflare-containers-ca\.crt/);
    assert.match(container, /update-ca-certificates/);
    assert.match(container, /exec node --enable-source-maps services\/ledger-api\/dist\/server\.js/);
  });

  it('passes the OpenBao Transit configuration required by P2P payment-method encryption', async () => {
    const container = await readFile(new URL('../src/ledger-container.ts', import.meta.url), 'utf8');
    assert.match(container, /OPENBAO_TRANSIT_URL/);
    assert.match(container, /OPENBAO_TRANSIT_TOKEN/);
  });

  it('documents a fail-closed staging deployment and rollback', async () => {
    const guide = await readFile(new URL('../docs/staging-deployment.md', import.meta.url), 'utf8');
    assert.match(guide, /WITHDRAWALS_ENABLED=false/);
    assert.match(guide, /wrangler rollback/);
    assert.match(guide, /不得使用管理員資料庫帳號/);
    assert.match(guide, /不得放入私鑰/);
    assert.match(guide, /OPENBAO_TRANSIT_URL/);
    assert.match(guide, /OPENBAO_TRANSIT_TOKEN/);
    assert.match(guide, /26257/);
    assert.match(guide, /不得為了直連資料庫改回 enableInternet=true/);
    assert.match(guide, /CORS_ALLOWED_ORIGINS/);
    assert.match(guide, /不可使用 `\*`/);
    assert.match(guide, /DEPOSIT_SIGNER/);
    assert.match(guide, /hidotpay-deposit-signer-staging/);
  });

  it('keeps the native Worker runtime unreachable before authentication and the explicit API gate', async () => {
    const worker = await readFile(new URL('../src/native-ledger-worker.ts', import.meta.url), 'utf8');
    assert.match(worker, /pathname === '\/healthz'/);
    assert.match(worker, /pathname\.startsWith\('\/v1\/'\)/);
    assert.match(worker, /request\.headers\.get\('authorization'\)/);
    assert.match(worker, /LEDGER_API_ENABLED !== 'true'/);
    assert.match(worker, /corsPreflightResponse/);
    assert.match(worker, /corsHeaders === null/);
    assert.match(worker, /return respond\(await \(await options\.createRuntime\(env\)\)\.handle\(request, actor\)\)/);
    assert.match(worker, /if \(response\) return respond\(response\)/);
  });

  it('binds Hyperdrive only to the isolated native staging Worker and keeps money gates closed', async () => {
    const config = await readFile(new URL('../wrangler-native-ledger-staging.jsonc', import.meta.url), 'utf8');
    assert.match(config, /"name": "hidotpay-native-ledger-staging"/);
    assert.match(config, /"binding": "HYPERDRIVE"/);
    assert.match(config, /"LEDGER_API_ENABLED": "true"/);
    assert.match(config, /"WITHDRAWALS_ENABLED": "false"/);
    assert.match(config, /"LOGTO_AUDIENCE": "https:\/\/api-dev\.hidotpay\.com"/);
    assert.match(config, /"LOGTO_ISSUER": "https:\/\/ngu7sy\.logto\.app\/oidc"/);
    assert.match(config, /hidotpay-wallet-ui\.lgninhk\.workers\.dev/);
    assert.match(config, /"binding": "DEPOSIT_SIGNER"/);
    assert.match(config, /"service": "hidotpay-deposit-signer-staging"/);
    assert.doesNotMatch(config, /DATABASE_URL|postgres(?:ql)?:\/\//i);
  });

});
