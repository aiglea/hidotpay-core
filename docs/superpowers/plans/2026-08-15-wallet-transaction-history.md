# 錢包交易紀錄 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為已登入使用者提供安全、可分頁且只讀的錢包帳本交易紀錄 API 與 App 畫面。

**Architecture:** Ledger API 從服務端解析登入者的可用帳戶，再透過 repository 以 keyset pagination 讀取該帳戶的 ledger posting。API 只輸出經過最小化的方向、金額、資產、類型與時間；App 以既有 HTTPS Bearer client 顯示第一頁並可安全載入下一頁。

**Tech Stack:** TypeScript、Fastify、Zod、CockroachDB/PostgreSQL、React Native/Expo、Node test runner。

## Global Constraints

- 僅新增唯讀功能；不得打開 `LEDGER_API_ENABLED` 或 `WITHDRAWALS_ENABLED`。
- API 只能以已驗證的登入者導出帳戶，絕不接受前端帳戶 ID。
- 不回傳交易對手、metadata、付款資料、鏈上地址／雜湊或任何密鑰。
- 金額一律為最小單位的正整數字串；方向只能由帳本 posting 正負決定。
- Web token 僅能送到 HTTPS API，並沿用精確 CORS 網域白名單。
- 每個使用者可見功能變動完成後更新版本、繁體中文 CHANGELOG、測試與 UI 實際渲染驗收。

---

### Task 1: 交易紀錄資料契約與 repository

**Files:**
- Modify: `services/ledger-api/src/repositories/ledger-repository.ts`
- Modify: `services/ledger-api/src/repositories/in-memory-ledger-repository.ts`
- Modify: `services/ledger-api/src/repositories/postgres-ledger-repository.ts`
- Create: `services/ledger-api/src/domain/wallet-transaction-cursor.ts`
- Test: `services/ledger-api/tests/repositories/wallet-transactions.test.ts`
- Test: `services/ledger-api/tests/integration/wallet-transactions.test.ts`

**Interfaces:**
- Produces `WalletTransaction`, `WalletTransactionPage`, `WalletTransactionPageRequest`, and `LedgerRepository.listWalletTransactions(accountId, page)`.
- Produces `encodeWalletTransactionCursor({ createdAt, id })` and `decodeWalletTransactionCursor(cursor)`.

- [x] **Step 1: Write failing unit tests for ordering, signed posting mapping, cursor round trip, invalid cursor, and account isolation.**

```ts
const page = await repository.listWalletTransactions(ownerAccountId, { limit: 1 });
assert.deepEqual(page.transactions[0], {
  id: transferId,
  type: 'internal_transfer',
  assetCode: 'USDT',
  amountAtoms: '1000000',
  direction: 'outgoing',
  createdAt: expectedCreatedAt,
});
assert.ok(page.nextCursor);
await assert.rejects(() => decodeWalletTransactionCursor('not-a-cursor'), { code: 'invalid_wallet_transaction_cursor' });
```

- [x] **Step 2: Run the focused test and confirm it fails because the method/module is missing.**

Run: `npm test --workspace=@hidotpay/ledger-api -- tests/repositories/wallet-transactions.test.ts`

Expected: a failing import or missing `listWalletTransactions`, not a passing test.

- [x] **Step 3: Add the minimal immutable response contract, strict base64url cursor parser, memory transaction record, and PostgreSQL seek query.**

```ts
export type WalletTransactionPage = { nextCursor?: string; transactions: WalletTransaction[] };

public async listWalletTransactions(accountId: string, page: WalletTransactionPageRequest): Promise<WalletTransactionPage> {
  const rows = await this.pool.query<WalletTransactionRow>(
    `SELECT transactions.id, transactions.transaction_type, postings.asset_code,
            postings.amount_atoms::STRING, transactions.created_at
      FROM ledger_postings AS postings
       JOIN ledger_transactions AS transactions ON transactions.id = postings.transaction_id
      WHERE postings.account_id = $1
        AND ($2::TIMESTAMPTZ IS NULL OR (transactions.created_at, transactions.id) < ($2::TIMESTAMPTZ, $3::UUID))
      ORDER BY transactions.created_at DESC, transactions.id DESC
      LIMIT $4`,
    parameters,
  );
  return toWalletTransactionPage(rows.rows, page.limit);
}
```

- [x] **Step 4: Re-run unit and dedicated CockroachDB integration tests.**

Run: `npm test --workspace=@hidotpay/ledger-api -- tests/repositories/wallet-transactions.test.ts && npm run test:integration --workspace=@hidotpay/ledger-api`

Expected: focused tests pass; integration tests either pass with dedicated test database or explicitly skip without one.

- [x] **Step 5: Commit this repository boundary.**

```bash
git add services/ledger-api/src/domain/wallet-transaction-cursor.ts services/ledger-api/src/repositories services/ledger-api/tests
git commit -m '新增錢包交易紀錄資料查詢'
```

### Task 2: 已登入使用者交易紀錄 HTTP API

**Files:**
- Modify: `services/ledger-api/src/http/app.ts`
- Modify: `services/ledger-api/src/http/errors.ts` if the cursor domain error needs an HTTP mapping
- Modify: `services/ledger-api/openapi/openapi.yaml`
- Modify: `services/ledger-api/docs/api.md`
- Test: `services/ledger-api/tests/http/wallet-transactions.test.ts`

**Interfaces:**
- Consumes `repository.listWalletTransactions(wallet.availableAccount.id, page)`.
- Produces `GET /v1/me/transactions?limit=&cursor=` with `{ transactions, next_cursor }`.

- [x] **Step 1: Write failing HTTP tests for own-history response, no caller account parameter, invalid query, unauthenticated rejection, and second-page cursor.**

```ts
const response = await app.inject({
  method: 'GET',
  url: '/v1/me/transactions?limit=1',
  headers: { 'x-actor-id': ownerId },
});
assert.equal(response.statusCode, 200);
assert.equal(response.json().transactions[0].direction, 'outgoing');
assert.equal(response.json().transactions[0].amount_atoms, '1000000');
assert.equal('counterparty_account_id' in response.json().transactions[0], false);
```

- [x] **Step 2: Run focused test and confirm the route is absent.**

Run: `npm test --workspace=@hidotpay/ledger-api -- tests/http/wallet-transactions.test.ts`

Expected: `404` for the new route before implementation.

- [x] **Step 3: Add a strict Zod query schema and a route that authenticates before ensuring the wallet and querying its available account.**

```ts
app.get('/v1/me/transactions', async (request) => {
  const actor = await authenticate(request.headers);
  const page = walletTransactionQuery.parse(request.query);
  const wallet = await options.repository.ensureUserWallet(actor.id);
  const result = await options.repository.listWalletTransactions(wallet.availableAccount.id, page);
  return { transactions: result.transactions.map(toPublicTransaction), next_cursor: result.nextCursor ?? null };
});
```

- [x] **Step 4: Update OpenAPI and Traditional Chinese API documentation with the exact public fields and privacy exclusions.**

- [x] **Step 5: Re-run focused HTTP tests, API document verification, and service typecheck.**

Run: `npm test --workspace=@hidotpay/ledger-api -- tests/http/wallet-transactions.test.ts && npm run verify:docs && npm run typecheck --workspace=@hidotpay/ledger-api`

Expected: all commands exit 0.

- [x] **Step 6: Commit the public API boundary.**

```bash
git add services/ledger-api/src/http/app.ts services/ledger-api/src/http/errors.ts services/ledger-api/openapi/openapi.yaml services/ledger-api/docs/api.md services/ledger-api/tests/http/wallet-transactions.test.ts
git commit -m '新增使用者交易紀錄 API'
```

### Task 3: App 交易紀錄 UI 與安全狀態

**Files:**
- Modify: `app/src/wallet-api.ts`
- Modify: `app/src/WalletHome.tsx`
- Modify: `app/tests/wallet-api.test.mjs`
- Modify: `app/tests/project-contract.test.mjs`

**Interfaces:**
- Consumes `GET /v1/me/transactions` and maps snake_case response into `WalletTransactionPage`.
- Produces an accessible history card with loading, empty, error, refresh and load-more states.

- [x] **Step 1: Write failing App API tests for Bearer request URL, safe transaction mapping, null cursor, load-more cursor, and HTTP rejection without calling fetch.**

```js
const page = await getWalletTransactions({ accessToken: 'token', apiBaseUrl: 'https://ledger.example.test' });
assert.equal(requests[0].url, 'https://ledger.example.test/v1/me/transactions?limit=20');
assert.deepEqual(page.transactions[0], {
  id: 'uuid', type: 'internal_transfer', assetCode: 'USDT', amountAtoms: '1000000', direction: 'outgoing', createdAt: '2026-08-15T00:00:00.000Z',
});
```

- [x] **Step 2: Run App test and confirm it fails because `getWalletTransactions` is absent.**

Run: `npm test --prefix app -- tests/wallet-api.test.mjs`

Expected: missing export failure.

- [x] **Step 3: Implement the HTTPS-only GET client and wire the history card into `WalletHome`.**

```tsx
const [history, setHistory] = useState<WalletTransactionPage>();
const loadHistory = async (cursor?: string) => {
  const page = await getWalletTransactions({ accessToken: await fetchToken(), apiBaseUrl, cursor });
  setHistory((current) => cursor && current ? { ...page, transactions: [...current.transactions, ...page.transactions] } : page);
};
```

- [x] **Step 4: Add card copy and styles for every state; transaction labels must stay generic for unknown types and must not render counterparties.**

- [x] **Step 5: Run App tests and typecheck.**

Run: `npm test --prefix app && npm run typecheck --prefix app`

Expected: all App tests and TypeScript pass.

- [x] **Step 6: Render and visually inspect logged-out, protected/unconfigured, loading, empty, error, multiple-record, and narrow-screen states.**

Run: `npm run web --prefix app`

Expected: no clipped form/history content, no product emoji, readable error/disabled states, and correct mobile scrolling.

- [x] **Step 7: Commit the App surface.**

```bash
git add app/src/WalletHome.tsx app/src/wallet-api.ts app/tests
git commit -m '新增錢包交易紀錄介面'
```

### Task 4: 發布驗收與繁體中文交接

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/phase-1-gaps.md`
- Modify: `package.json`, `package-lock.json`, `app/package.json`, `app/package-lock.json`, `app/app.config.js`

- [x] **Step 1: 將版本由 0.2.53 升至下一個 patch，並在所有 App/根目錄 metadata 保持一致。**

- [x] **Step 2: 將已完成交易紀錄功能與仍需外部驗收的 Logto Resource／測試網端到端流程分開寫入繁體中文文件。**

- [x] **Step 3: 跑完整驗收。**

Run: `npm test && npm run typecheck && npm run build && npm run verify:docs && npm run test:integration && npm test --prefix app && npm run typecheck --prefix app && git diff --check`

Expected: all unit/build/doc checks pass; integration runs only against `/hidotpay_test` and safely skips if the dedicated URL is absent.

- [x] **Step 4: 提交、推送與更新 Draft PR。**

```bash
git add -A
git commit -m '發布 0.2.54：完成受保護錢包交易紀錄'
git push -u origin codex/financial-core
gh pr edit 1 --title '發布 0.2.54：完成受保護錢包交易紀錄'
```
