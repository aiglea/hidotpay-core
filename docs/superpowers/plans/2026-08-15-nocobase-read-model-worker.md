# NocoBase 唯讀後台投影工作者 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將指定的 CockroachDB 五個 `admin_*` 唯讀檢視表安全投影到 NocoBase 主資料庫的六個集合（含同步狀態），讓低代碼後台只讀取可重建的資料。

**Architecture:** 新增無狀態 Node worker。它使用來源專用帳號讀取固定欄位白名單，透過受限 NocoBase API token 對自己的投影集合冪等 upsert，並保存每次成功時間。帳本不接受此 worker 的任何寫入，NocoBase 停機只會造成查詢資料落後。

**Tech Stack:** TypeScript、Node 22、`pg`、原生 `fetch`、CockroachDB、NocoBase Community Edition API。

## Global Constraints

- 僅讀取 `admin_wallet_addresses`、`admin_deposit_receipts`、`admin_withdrawal_requests`、`admin_ledger_transactions` 與 `admin_withdrawal_risk_decisions`。
- 來源 URL 必須使用 `hidotpay_nocobase_reader`；不得以帳本寫入帳號或超級使用者執行。
- 不得投影私鑰、助記詞、簽名器參照、OpenBao 密文、付款帳戶原文、JWT 或連線密碼。
- 每一筆以來源 `id` 對應 `source_id`；任何重跑均為 upsert，不可重複新增。
- NocoBase token 只可被授予投影集合的建立／更新權限；不得使用 NocoBase 管理者密碼作為正式 worker secret。
- 不改變 `LEDGER_API_ENABLED=false`、`WITHDRAWALS_ENABLED=false` 或任何資金寫入路徑。

---

### Task 1: 投影資料契約與欄位白名單

**Files:**
- Create: `services/admin-read-model-worker/src/contracts.ts`
- Create: `services/admin-read-model-worker/src/normalize.ts`
- Create: `services/admin-read-model-worker/tests/normalize.test.ts`
- Create: `services/admin-read-model-worker/package.json`
- Create: `services/admin-read-model-worker/tsconfig.json`

**Interfaces:** Produces `ProjectionName`、`ProjectionRecord`、`normalizeProjectionRows(name, rows)`。Consumes `Record<string, unknown>[]` from CockroachDB.

- [ ] **Step 1: Write the failing test**

```ts
test('wallet address projection accepts only documented fields', () => {
  const result = normalizeProjectionRows('wallet_addresses', [{
    id: sourceId, address: '0x1234', network: 'ethereum', status: 'active',
    created_at: stamp, private_key: 'must-not-leak',
  }]);
  assert.deepEqual(result, [{ source_id: sourceId, address: '0x1234', network: 'ethereum', status: 'active', source_updated_at: stamp }]);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test --workspace=@hidotpay/admin-read-model-worker -- normalize.test.ts`

Expected: FAIL because `normalizeProjectionRows` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export type ProjectionName = 'wallet_addresses' | 'deposit_receipts' | 'withdrawal_requests' | 'ledger_transactions' | 'withdrawal_risk_decisions';
export type ProjectionRecord = { source_id: string; source_updated_at: string } & Record<string, string | null>;
export function normalizeProjectionRows(name: ProjectionName, rows: Record<string, unknown>[]): ProjectionRecord[] {
  return rows.map((row) => selectAndValidateAllowedFields(name, row));
}
```

`selectAndValidateAllowedFields` must reject missing IDs and timestamps, convert only explicit fields to strings or `null`, and never spread a source row.

- [ ] **Step 4: Verify GREEN**

Run: `npm test --workspace=@hidotpay/admin-read-model-worker -- normalize.test.ts`

Expected: PASS with private fields absent.

- [ ] **Step 5: Commit**

```bash
git add services/admin-read-model-worker
git commit -m "新增後台投影欄位白名單"
```

### Task 2: 來源讀取器與冪等協調器

**Files:**
- Create: `services/admin-read-model-worker/src/source-reader.ts`
- Create: `services/admin-read-model-worker/src/projector.ts`
- Create: `services/admin-read-model-worker/tests/projector.test.ts`

**Interfaces:** Consumes `ProjectionName`、`ProjectionRecord` from Task 1. Produces `AdminReadModelProjector.runOnce()`.

- [ ] **Step 1: Write the failing test**

```ts
test('a second run upserts the same source IDs instead of creating duplicates', async () => {
  const target = new InMemoryProjectionTarget();
  const worker = new AdminReadModelProjector(new StaticSourceReader({ wallet_addresses: [sourceWalletRow] }), target);
  await worker.runOnce();
  await worker.runOnce();
  assert.equal(target.records('wallet_addresses').length, 1);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test --workspace=@hidotpay/admin-read-model-worker -- projector.test.ts`

Expected: FAIL because `AdminReadModelProjector` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export interface AdminProjectionSource { list(name: ProjectionName): Promise<Record<string, unknown>[]>; }
export interface AdminProjectionTarget { upsert(name: ProjectionName, records: ProjectionRecord[]): Promise<void>; markSuccess(at: string): Promise<void>; }
export class AdminReadModelProjector {
  async runOnce(): Promise<{ projected: number; projections: Record<ProjectionName, number> }> { /* fixed five-view loop */ }
}
```

`PostgresAdminProjectionSource` must use five hard-coded SELECT statements; it must not assemble SQL from runtime collection names. `markSuccess` runs only after every target write succeeds.

- [ ] **Step 4: Verify GREEN**

Run: `npm test --workspace=@hidotpay/admin-read-model-worker -- projector.test.ts`

Expected: PASS; target failure leaves `markSuccess` uncalled.

- [ ] **Step 5: Commit**

```bash
git add services/admin-read-model-worker
git commit -m "新增後台唯讀投影協調器"
```

### Task 3: NocoBase 受限 API 目標與本機執行器

**Files:**
- Create: `services/admin-read-model-worker/src/nocobase-target.ts`
- Create: `services/admin-read-model-worker/src/config.ts`
- Create: `services/admin-read-model-worker/src/cli/run-once.ts`
- Create: `services/admin-read-model-worker/tests/nocobase-target.test.ts`

**Interfaces:** Consumes `AdminProjectionTarget` from Task 2. Produces `NocoBaseProjectionTarget` and `loadConfig(env)`.

- [ ] **Step 1: Write the failing test**

```ts
test('target sends updateOrCreate with source_id and never serializes a database URL', async () => {
  const target = new NocoBaseProjectionTarget(fakeNocoBaseFetch);
  await target.upsert('ledger_transactions', [transactionProjection]);
  assert.match(String(fakeNocoBaseFetch.body), /source_id/);
  assert.doesNotMatch(String(fakeNocoBaseFetch.body), /DATABASE_URL|postgres:|cockroach/i);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test --workspace=@hidotpay/admin-read-model-worker -- nocobase-target.test.ts`

Expected: FAIL because `NocoBaseProjectionTarget` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
await fetch(`${baseUrl}/api/hidotpay_admin_${name}:updateOrCreate`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify(record),
});
```

`filterKeys[]=source_id` 必須放在 URL 查詢參數；NocoBase 會把 JSON 本文視為 `values`。

`loadConfig` must reject missing `ADMIN_READ_MODEL_SOURCE_DATABASE_URL`, `NOCOBASE_URL` or `NOCOBASE_API_TOKEN`, reject non-HTTPS NocoBase in production, and never print values.

- [ ] **Step 4: Verify GREEN**

Run: `npm test --workspace=@hidotpay/admin-read-model-worker -- nocobase-target.test.ts`

Expected: PASS with token only in a request header.

- [ ] **Step 5: Commit**

```bash
git add services/admin-read-model-worker
git commit -m "接上受限 NocoBase 投影目標"
```

### Task 4: 可重現集合、唯讀角色與部署門檻

**Files:**
- Create: `deployment/nocobase/bootstrap-read-model.mjs`
- Create: `deployment/nocobase/smoke-read-model.sh`
- Create: `deployment/kubernetes/base/admin-read-model-worker.yaml`
- Modify: `deployment/kubernetes/base/kustomization.yaml`
- Modify: `deployment/kubernetes/smoke-test.sh`
- Modify: `deployment/nocobase/README.md`
- Modify: `docs/phase-1-gaps.md`

**Interfaces:** Consumes Task 3 CLI and six `hidotpay_admin_*` collections. Produces a projection-only bootstrap, `hidotpay_finance_viewer` role, and private Kubernetes workload.

- [ ] **Step 1: Write the failing smoke test**

```sh
test -s "$(dirname "$0")/bootstrap-read-model.mjs"
grep -q 'hidotpay_admin_ledger_transactions' "$(dirname "$0")/bootstrap-read-model.mjs"
grep -q 'source_id' "$(dirname "$0")/bootstrap-read-model.mjs"
if grep -Eq 'withdrawals:approve|custom-request|data-source-manager' "$(dirname "$0")/bootstrap-read-model.mjs"; then exit 1; fi
```

- [ ] **Step 2: Verify RED**

Run: `sh deployment/nocobase/smoke-read-model.sh`

Expected: FAIL because bootstrap files do not exist.

- [ ] **Step 3: Write minimal implementation**

`bootstrap-read-model.mjs` creates a projection-status collection plus five financial NocoBase collections, makes each financial `source_id` unique, creates a `hidotpay_finance_viewer` role with list/get only, and creates a separate projection identity with update-or-create only for those collections. It must not create an API which invokes ledger actions.

The Kubernetes workload runs non-root with a read-only filesystem, no public ingress, and receives exactly `ADMIN_READ_MODEL_SOURCE_DATABASE_URL`, `NOCOBASE_URL`, and `NOCOBASE_API_TOKEN` from its dedicated secret.

- [ ] **Step 4: Verify GREEN**

Run: `sh deployment/nocobase/smoke-read-model.sh && sh deployment/kubernetes/smoke-test.sh && npm test --workspace=@hidotpay/admin-read-model-worker && npm run typecheck`

Expected: PASS; smoke assertions confirm no signing, source write, or withdrawal approval permission.

- [ ] **Step 5: Commit and publish**

```bash
git add deployment/nocobase deployment/kubernetes docs/phase-1-gaps.md services/admin-read-model-worker
git commit -m "完成 NocoBase 唯讀投影後台基礎"
git push
```
