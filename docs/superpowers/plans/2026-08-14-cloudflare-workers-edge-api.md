# Cloudflare Workers 金融 API 入口實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** 在不改變既有資金規則、CockroachDB 或私有 signer 邊界的前提下，將公開金融 API 提供為 Cloudflare Workers 服務。

**Architecture:** 新增 \`@hidotpay/edge-api\`，以 Fastify 的 \`app.inject()\` 將既有 HTTP 契約轉成 Workers 的 \`fetch()\` 介面，不開 TCP listener。Worker 透過 Hyperdrive 的連線字串建立既有 Postgres-compatible repository；Worker 綁定只允許 Logto、資料庫、Blnk 最小權限與 signer 服務憑證，絕不保存私鑰、助記詞或 root token。

**Tech Stack:** TypeScript、Fastify 5、Cloudflare Workers、Hyperdrive、CockroachDB、Logto、Node test、Vitest Workers pool。

## Global Constraints

- 金額維持原子單位字串或 \`DECIMAL(39,0)\`；禁止 JavaScript \`number\` 作資金計算。
- \`WITHDRAWALS_ENABLED\` 在所有 Worker 環境固定為 \`false\`；Worker 不廣播鏈上交易。
- 不新增或遷移 Blnk、CockroachDB 的金融資料；既有 repository、idempotency key 與交易不變量是唯一真相。
- 機密只能以 Workers secret 綁定；配置、日誌、測試和 Git 不可出現助記詞、私鑰或 root token。
- 此可發布更新把 root、workspace 與部署版本由 \`0.2.42\` 提升為 \`0.2.43\`。
- 所有行為先以失敗測試證明，再寫最小實作。

---

### Task 1: 建立可測試的 Workers 專案邊界

**Files:**
- Create: \`services/edge-api/package.json\`
- Create: \`services/edge-api/wrangler.jsonc\`
- Create: \`services/edge-api/tests/project-layout.test.mjs\`

**Interfaces:**
- Produces: zero-dependency project-layout test; the Worker runtime test harness is deliberately added with the handler in Task 2.
- Produces: binding contract \`EdgeWorkerEnv\` in the next task: \`HYPERDRIVE.connectionString\`, \`LOGTO_AUDIENCE\`, \`LOGTO_ISSUER\`, \`WITHDRAWAL_FEE_SCHEDULE\`, \`SIGNER_DERIVATION_URL\`, \`SIGNER_SERVICE_TOKEN\`.

- [ ] **Step 1: Write the failing project-layout test.**

\`\`\`ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('declares a Hyperdrive binding without committing its connection value', async () => {
  const config = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(config, /"binding": "HYPERDRIVE"/);
  assert.doesNotMatch(config, /postgres(?:ql)?:\/\//i);
});
\`\`\`

- [ ] **Step 2: Run the test and verify it fails because the Worker entrypoint does not exist.**

Run: \`npm run test --workspace=@hidotpay/edge-api\`

Expected: FAIL because \`services/edge-api\` and \`wrangler.jsonc\` are absent.

- [ ] **Step 3: Add only package, TypeScript and Wrangler configuration.**

\`\`\`json
{
  "name": "@hidotpay/edge-api",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.mjs"
  }
}
\`\`\`

Use a Worker compatibility date, \`nodejs_compat\`, an unconfigured \`HYPERDRIVE\` binding, and no values for any secret in \`wrangler.jsonc\`.

- [ ] **Step 4: Run the project-layout test and verify it passes.**

Run: \`npm run test --workspace=@hidotpay/edge-api\`

Expected: PASS; the project-layout check is ready. Task 2 will add the Worker runtime test harness and its locked dependencies with the actual handler.

### Task 2: Adapt the existing HTTP contract to a Worker fetch handler

**Files:**
- Create: \`services/edge-api/src/environment.ts\`
- Create: \`services/edge-api/src/index.ts\`
- Create: \`services/edge-api/tsconfig.json\`, \`services/edge-api/vitest.config.ts\`
- Modify: \`services/ledger-api/src/http/auth.ts\`
- Test: \`services/ledger-api/tests/http/auth.test.ts\`
- Modify: \`services/edge-api/package.json\`, \`package-lock.json\`
- Test: \`services/edge-api/tests/worker-api.test.ts\`

**Interfaces:**
- Consumes: \`buildApp(options): FastifyInstance\` from \`services/ledger-api/src/http/app.ts\`.
- Produces: \`createFinancialWorker(env: EdgeWorkerEnv): Promise<{ fetch(request: Request): Promise<Response> }>\`.
- Produces: default export \`{ fetch(request, env, ctx): Promise<Response> }\`.

- [ ] **Step 1: Add the locked Workers runtime test harness, then write the failing Worker health contract test.**

\`\`\`ts
import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('financial edge worker', () => {
  it('answers health checks without opening a TCP port', async () => {
    const response = await SELF.fetch('https://api.example.test/healthz');
    expect(response.status).toBe(200);
expect(await response.json()).toEqual({
  ok: true,
  service: 'hidotpay-ledger-api',
  status: 'ok',
});
  });
});
\`\`\`

- [ ] **Step 2: Run it and verify it fails because the Worker entrypoint is absent.**

Run: \`npm run test --workspace=@hidotpay/edge-api\`

Expected: FAIL naming the missing Worker entrypoint or default export.

- [ ] **Step 3: Configure the official Workers Vitest pool with only synthetic test bindings.**

\`\`\`ts
export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: {
          LOGTO_AUDIENCE: 'https://api-test.hidotpay.example',
          LOGTO_ISSUER: 'https://issuer-test.hidotpay.example/oidc',
          SIGNER_DERIVATION_URL: 'https://signer-test.hidotpay.example/derive',
          SIGNER_SERVICE_TOKEN: 'test-service-token-that-is-not-a-secret',
          WITHDRAWAL_FEE_SCHEDULE: '{"ethereum:USDT":"1"}',
        },
        hyperdrives: {
          HYPERDRIVE: 'postgres://test:test@127.0.0.1:5432/hidotpay_test',
        },
      },
      wrangler: { configPath: './wrangler.jsonc' },
    }),
  ],
});
\`\`\`

The Hyperdrive URI above is a non-routable test fixture, never a real database credential; the health test must not query it. Add the official test-pool and Vitest dependencies to \`package.json\` and the root lockfile. Extend \`wrangler.jsonc\` with \`main: \"src/index.ts\"\`, but never add secret values there.

- [ ] **Step 4: Make authentication discovery lazy before creating the Fastify app.**

\`\`\`ts
let jwks: Promise<ReturnType<typeof createRemoteJWKSet>> | undefined;
const getJwks = () => (jwks ??= discoverJwks(config.logtoIssuer!));
// call await getJwks() only after a bearer token is received
\`\`\`

Add a regression test that creating a production authenticator with an unreachable issuer does not fetch or reject until an authenticated endpoint actually supplies a bearer token. This permits unauthenticated health checks to work during a Logto outage without weakening token verification.

- [ ] **Step 5: Implement a minimal inject adapter.**

\`\`\`ts
export async function createFinancialWorker(env: EdgeWorkerEnv) {
  const app = buildApp(/* existing Postgres repository using env.HYPERDRIVE.connectionString */);
  await app.ready();

  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const reply = await app.inject({
        headers: Object.fromEntries(request.headers),
        method: request.method,
        payload: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text(),
        url: url.pathname + url.search,
      });
      return new Response(reply.body, { headers: reply.headers, status: reply.statusCode });
    },
  };
}
\`\`\`

Configuration construction must explicitly set \`NODE_ENV=production\`, read the database URL only from Hyperdrive, and override any supplied \`WITHDRAWALS_ENABLED\` to \`false\`.

- [ ] **Step 6: Run focused API/Worker checks.**

Run: \`npm run test --workspace=@hidotpay/edge-api && npm run test --workspace=@hidotpay/ledger-api\`

Expected: both commands exit 0.

- [ ] **Step 7: Commit the actual Worker HTTP adapter with its lockfile.**

\`\`\`bash
git add services/edge-api services/ledger-api/src/http/auth.ts services/ledger-api/tests/http/auth.test.ts package-lock.json
git commit -m "feat: 讓金融 API 在 Cloudflare Workers 執行"
\`\`\`

### Task 3: Prove security regressions remain blocked

**Files:**
- Modify: \`services/edge-api/tests/worker-api.test.ts\`
- Modify: \`services/edge-api/src/environment.ts\`

**Interfaces:**
- Consumes: \`EdgeWorkerEnv\`.
- Produces: startup validation that rejects a Worker configuration enabling mainnet withdrawals or including prohibited custody material.

- [ ] **Step 1: Write failing validation tests.**

\`\`\`ts
it('rejects a Worker configuration that enables withdrawals', () => {
  expect(() => workerConfig({ ...validEnv, WITHDRAWALS_ENABLED: 'true' })).toThrow('must keep withdrawals disabled');
});

it('does not define a private key or mnemonic binding', () => {
  expect(Object.keys(workerConfig(validEnv))).not.toContain('PRIVATE_KEY');
  expect(Object.keys(workerConfig(validEnv))).not.toContain('MNEMONIC');
});
\`\`\`

- [ ] **Step 2: Run and verify the first test fails because no Worker-specific validation exists.**

Run: \`npm run test --workspace=@hidotpay/edge-api\`

Expected: FAIL naming \`workerConfig\` or the missing rejection.

- [ ] **Step 3: Implement explicit worker configuration validation.**

\`\`\`ts
if (env.WITHDRAWALS_ENABLED === 'true') {
  throw new Error('Cloudflare Worker must keep withdrawals disabled');
}
for (const name of ['PRIVATE_KEY', 'MNEMONIC', 'SEED', 'ROOT_TOKEN']) {
  if (name in env) throw new Error(\`prohibited custody binding: \${name}\`);
}
\`\`\`

- [ ] **Step 4: Run focused checks plus static type check.**

Run: \`npm run test --workspace=@hidotpay/edge-api && npm run typecheck\`

Expected: both commands exit 0.

### Task 4: Deployment documentation, release version and verification

**Files:**
- Create: \`deployment/cloudflare/README.md\`
- Create: \`deployment/cloudflare/smoke-test.sh\`
- Create: \`deployment/cloudflare/.dev.vars.example\`
- Modify: \`package.json\`, \`package-lock.json\`, all workspace \`package.json\` files, \`services/ledger-api/openapi/openapi.yaml\`, deployment image tags and \`docs/operations/production-acceptance.md\`

**Interfaces:**
- Consumes: the Worker binding names in \`services/edge-api/wrangler.jsonc\`.
- Produces: a copy-pasteable deployment runbook and static proof that no Worker source/config carries custody material.

- [ ] **Step 1: Write a failing deployment smoke test.**

\`\`\`sh
#!/bin/sh
set -eu
test -s services/edge-api/wrangler.jsonc
test -s services/edge-api/src/index.ts
! grep -REiq '(PRIVATE_KEY|MNEMONIC|SEED|ROOT_TOKEN)' services/edge-api
grep -q 'WITHDRAWALS_ENABLED' services/edge-api/src/environment.ts
\`\`\`

- [ ] **Step 2: Run it and verify it fails because \`deployment/cloudflare/smoke-test.sh\` is absent.**

Run: \`sh deployment/cloudflare/smoke-test.sh\`

Expected: FAIL with a no-such-file error.

- [ ] **Step 3: Document setup, secret ownership and non-Workers components.**

The runbook must require: a Cloudflare account, a Hyperdrive binding to CockroachDB Cloud, Worker secrets entered outside Git, a private Blnk deployment, a private signer protected by mTLS/Access, and \`WITHDRAWALS_ENABLED=false\`. It must explicitly state that deployment cannot proceed to mainnet without a separately accepted signer/HSM/MPC verification.

- [ ] **Step 4: Bump every published project version from \`0.2.42\` to \`0.2.43\`.**

Run: \`rg -n '0\\.2\\.42' package.json package-lock.json services deployment\`

Expected: only intentional historical docs may still contain \`0.2.42\`; active workspace manifests, OpenAPI and deployment image tags contain \`0.2.43\`.

- [ ] **Step 5: Run all acceptance checks.**

Run: \`sh deployment/cloudflare/smoke-test.sh && npm test && npm run typecheck && npm run build && npm run verify:docs\`

Expected: every command exits 0. Deployment remains a separate action requiring the user’s authenticated Cloudflare account or explicitly scoped token.

- [ ] **Step 6: Commit.**

\`\`\`bash
git add deployment/cloudflare docs/operations services/edge-api services/ledger-api package.json package-lock.json
git commit -m "feat: 建立 Cloudflare Workers 金融 API 基線"
\`\`\`

## Self-Review

- [x] This plan adds only the public API Worker and deliberately leaves event Queue/Workflow migration for follow-up plans, so each reviewed unit is independently testable.
- [x] Existing Kubernetes, Redpanda and Temporal artifacts remain rollback material until later Cloudflare Queue and Workflow production evidence exists.
- [x] No step lets a Worker hold a private key or turns mainnet withdrawals on.
