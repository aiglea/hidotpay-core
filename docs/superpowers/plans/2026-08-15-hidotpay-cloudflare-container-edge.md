# HiDot Pay Cloudflare Container Edge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一個可部署到 Cloudflare 的帳本 API 邊緣入口，讓 Worker 不接觸資料庫或私鑰，並只在明確配置的 staging 環境開放健康檢查。

**Architecture:** `services/edge-api` 是 Cloudflare Worker 與 Durable Object Container 的薄層；Container 啟動既有 `services/ledger-api` 映像，Worker 只代理到 Container。Container 的資料庫連線由 `LEDGER_DATABASE_URL` Secret 注入，部署前必須建立獨立最小權限 CockroachDB 帳號；沒有 signer/HSM、資料庫 Secret 或 Logto 設定時，服務不可宣稱可處理資金。

**Tech Stack:** Cloudflare Workers、Cloudflare Containers/Durable Objects、Wrangler、Node.js 22、Fastify、CockroachDB TLS、Node test runner。

## Global Constraints

- 僅使用 Cloudflare 最小權限 API Token；不得使用或寫入 Global API Key。
- Worker、Container、NocoBase、Git 與日誌都不可儲存錢包私鑰、助記詞或 seed。
- `WITHDRAWALS_ENABLED=false` 必須是 staging 與 production 的預設。
- 原子金額僅用字串；帳本變更必須走既有 ledger API。
- 不改動既有未提交檔案，除非該檔案正是本計畫的必要範圍。
- 每次可發布程式變更都要遞增版本並以繁體中文提交訊息提交。

---

## File Structure

- `services/edge-api/tests/container-config.test.mjs`：驗證 Worker/Container 名稱、禁止的環境變數和 Docker 建置根目錄。
- `services/edge-api/src/edge-worker.ts`：唯一 Worker 入口；公開 `GET /healthz`，其餘 `/v1/*` 代理給 Container。
- `services/edge-api/src/ledger-container.ts`：唯一 Container 類別；只將明確白名單設定轉給 Fastify 程序。
- `services/edge-api/wrangler.jsonc`：staging Worker、Durable Object、Container 映像與遷移設定。
- `services/edge-api/package.json`：獨立 Worker 依賴與測試、型別、部署指令。
- `services/edge-api/package-lock.json`：僅此 workspace 的可重現依賴鎖定。
- `services/edge-api/Dockerfile`：Container 專用啟動層，重用既有 ledger image 的安全啟動命令。
- `services/edge-api/docs/staging-deployment.md`：精確部署、Secret 設定、回滾和驗證命令。

### Task 1: 用測試鎖定安全部署設定

**Files:**

- Create: `services/edge-api/tests/container-config.test.mjs`
- Modify: `services/edge-api/wrangler.jsonc`
- Modify: `services/edge-api/package.json`

**Interfaces:** Consumes `wrangler.jsonc` JSON-with-comments 設定。Produces Node test 驗證的 Container 設定契約。

- [ ] **Step 1: 寫入失敗測試**

```js
test('staging 設定把帳本 API 放在 Container 且不綁資料庫給 Worker', async () => {
  const raw = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(raw, /"containers"/);
  assert.match(raw, /"durable_objects"/);
  assert.doesNotMatch(raw, /"HYPERDRIVE"/);
  assert.doesNotMatch(raw, /DATABASE_URL/);
});
```

- [ ] **Step 2: 執行測試確認 RED**

Run: `npm test --workspace=@hidotpay/edge-api`

Expected: FAIL，因為 Container 與 Durable Object 設定尚未存在。

- [ ] **Step 3: 寫入最小設定**

```jsonc
{
  "name": "hidotpay-edge-api-staging",
  "main": "src/edge-worker.ts",
  "compatibility_date": "2026-08-15",
  "compatibility_flags": ["nodejs_compat"],
  "containers": [{ "class_name": "LedgerContainer", "image": "./Dockerfile", "image_build_context": "../.." }],
  "durable_objects": { "bindings": [{ "name": "LEDGER_CONTAINER", "class_name": "LedgerContainer" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["LedgerContainer"] }]
}
```

- [ ] **Step 4: 執行測試確認 GREEN**

Run: `npm test --workspace=@hidotpay/edge-api`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add services/edge-api/package.json services/edge-api/package-lock.json services/edge-api/tests/container-config.test.mjs services/edge-api/wrangler.jsonc
git commit -m "feat: 建立 Cloudflare Container 邊緣設定"
```

### Task 2: 實作最小、可稽核的 Worker 與 Container 邊界

**Files:**

- Create: `services/edge-api/src/edge-worker.ts`
- Create: `services/edge-api/src/ledger-container.ts`
- Modify: `services/edge-api/tests/container-config.test.mjs`

**Interfaces:** Consumes `Env.LEDGER_CONTAINER: DurableObjectNamespace`。Produces `fetch(request, env): Promise<Response>`；`GET /healthz` 回 `200 {"status":"ok"}`，`/v1/*` 只轉送至 Container。

- [ ] **Step 1: 寫入失敗測試**

```js
test('未知路徑不會被誤送往帳本容器', async () => {
  const source = await readFile(new URL('../src/edge-worker.ts', import.meta.url), 'utf8');
  assert.match(source, /pathname === '\/healthz'/);
  assert.match(source, /pathname\.startsWith\('\/v1\/'\)/);
  assert.match(source, /new Response\('Not Found', \{ status: 404 \}\)/);
});
```

- [ ] **Step 2: 執行測試確認 RED**

Run: `npm test --workspace=@hidotpay/edge-api`

Expected: FAIL，因為 `src/edge-worker.ts` 尚未存在。

- [ ] **Step 3: 寫入最小實作**

```ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/healthz') return Response.json({ status: 'ok' });
    if (!url.pathname.startsWith('/v1/')) return new Response('Not Found', { status: 404 });
    const id = env.LEDGER_CONTAINER.idFromName('ledger-api');
    return env.LEDGER_CONTAINER.get(id).fetch(request);
  },
};
```

`ledger-container.ts` 必須繼承 `Container`，且只透過 `this.env` 讀取 `LEDGER_DATABASE_URL`、`BLNK_BASE_URL`、`SIGNER_DERIVATION_URL`、`SIGNER_SERVICE_TOKEN`、`WITHDRAWALS_ENABLED`；不得讀取任何私鑰名稱。

- [ ] **Step 4: 執行測試與型別檢查確認 GREEN**

Run: `npm test --workspace=@hidotpay/edge-api && npm run typecheck --workspace=@hidotpay/edge-api`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add services/edge-api/src services/edge-api/tests/container-config.test.mjs
git commit -m "feat: 實作受控帳本 Container 入口"
```

### Task 3: 加入可重現映像與 staging 操作文件

**Files:**

- Create: `services/edge-api/Dockerfile`
- Create: `services/edge-api/docs/staging-deployment.md`
- Modify: `services/edge-api/tests/container-config.test.mjs`

**Interfaces:** Consumes repository 根目錄 Docker build context 與 `services/ledger-api` 原始碼。Produces `wrangler deploy --env staging` 可建置映像；文件中有 Secret、回滾、健康檢查與停止條件。

- [ ] **Step 1: 寫入失敗測試**

```js
test('Container 映像由 repository 根目錄建置，且沒有複製秘密檔', async () => {
  const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8');
  assert.match(dockerfile, /FROM node:22\.19\.0-bookworm-slim/);
  assert.doesNotMatch(dockerfile, /\.env/);
  assert.doesNotMatch(dockerfile, /PRIVATE_KEY|MNEMONIC|SEED/i);
});
```

- [ ] **Step 2: 執行測試確認 RED**

Run: `npm test --workspace=@hidotpay/edge-api`

Expected: FAIL，因為 Container Dockerfile 尚未存在。

- [ ] **Step 3: 寫入最小 Dockerfile 與操作文件**

```dockerfile
FROM node:22.19.0-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY services/ledger-api/package.json services/ledger-api/package.json
RUN npm ci --ignore-scripts --workspace=@hidotpay/ledger-api
COPY services/ledger-api services/ledger-api
RUN npm run build --workspace=@hidotpay/ledger-api
CMD ["node", "--enable-source-maps", "services/ledger-api/dist/server.js"]
```

文件必須列出五個非私鑰 Secret、`WITHDRAWALS_ENABLED=false`、只使用 staging 名稱、`curl /healthz`、以及 `wrangler rollback`。

- [ ] **Step 4: 執行測試確認 GREEN**

Run: `npm test --workspace=@hidotpay/edge-api && npm run build --workspace=@hidotpay/ledger-api`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add services/edge-api/Dockerfile services/edge-api/docs/staging-deployment.md services/edge-api/tests/container-config.test.mjs
git commit -m "docs: 補齊 Cloudflare staging 部署驗證"
```

### Task 4: 以最小權限憑證部署安全 staging 並驗收

**Files:**

- Modify: `services/edge-api/docs/staging-deployment.md`

**Interfaces:** Consumes macOS Keychain 的 `hidotpay-cloudflare-deployment-token`、獨立 CockroachDB runtime 帳號，以及外部 signer 的非主網 derivation endpoint。Produces Cloudflare Worker staging URL、部署版本與健康檢查證據。

- [ ] **Step 1: 驗證部署權限與本機容器建置能力**

```bash
export CLOUDFLARE_API_TOKEN="$(security find-generic-password -s hidotpay-cloudflare-deployment-token -w)"
npx --no-install wrangler whoami
docker info --format '{{.ServerVersion}}'
```

Expected: token 只顯示 HiDot Pay 帳號，Docker 可回傳 server version。

- [ ] **Step 2: 寫入 runtime Secret，不輸出值**

```bash
npx --no-install wrangler secret put LEDGER_DATABASE_URL --name hidotpay-edge-api-staging
npx --no-install wrangler secret put BLNK_BASE_URL --name hidotpay-edge-api-staging
npx --no-install wrangler secret put SIGNER_DERIVATION_URL --name hidotpay-edge-api-staging
npx --no-install wrangler secret put SIGNER_SERVICE_TOKEN --name hidotpay-edge-api-staging
printf 'false' | npx --no-install wrangler secret put WITHDRAWALS_ENABLED --name hidotpay-edge-api-staging
```

Expected: 每條命令只回報 secret 已更新，永不印出值。若尚無專屬 runtime DB 帳號或測試網 signer，停止在此步，不能以管理員帳號或主網 signer 代替。

- [ ] **Step 3: 部署並驗證公開健康檢查**

```bash
npx --no-install wrangler deploy --env staging
curl --fail --silent --show-error https://hidotpay-edge-api-staging.<workers-subdomain>.workers.dev/healthz
```

Expected: 部署回傳版本與 URL；健康檢查回傳 `{"status":"ok"}`。

- [ ] **Step 4: 驗證沒有誤開資金 API**

```bash
curl --include https://hidotpay-edge-api-staging.<workers-subdomain>.workers.dev/v1/internal-transfers
curl --include https://hidotpay-edge-api-staging.<workers-subdomain>.workers.dev/not-a-route
```

Expected: 前者未帶登入資訊時為 401/403，後者為 404；絕不可有資金資料。

- [ ] **Step 5: 提交部署證據（不含 Secret 或 URL token）**

```bash
git add services/edge-api/docs/staging-deployment.md
git commit -m "docs: 記錄 Cloudflare staging 驗收結果"
```

## 自我審核

1. **規格覆蓋：** Task 1 防止 Worker 取得 DB；Task 2 強制只有 `/v1/*` 進 Container；Task 3 防止映像夾帶秘密並提供回滾；Task 4 用獨立帳號、禁用提現的真實部署驗收。
2. **未完成項：** 本計畫不建立或保存 secp256k1 私鑰，不以 staging 宣稱主網可出金；HSM、雙人覆核、測試網完整演練與獨立審計仍是主網啟用條件。
3. **一致性：** 服務名稱固定為 `hidotpay-edge-api-staging`，Container 類名固定為 `LedgerContainer`，資料庫 Secret 固定為 `LEDGER_DATABASE_URL`。
