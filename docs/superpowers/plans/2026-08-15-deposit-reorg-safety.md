# 充值鏈重組安全修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 確保配置的鏈重組視窗內不會先把充值入帳再失效；深度重組或歷史失效入帳紀錄一律停止掃描並要求人工覆核。

**Architecture:** `DepositScanner` 只掃到 `head - reorgWindow` 的安全水位，游標永遠落在可安全入帳的區塊。已保存安全游標的雜湊不一致即拋出 `deep_chain_reorg_detected`，不回退游標、不標記已入帳觀測失效。PostgreSQL store 對舊版留下的 orphaned+receipt 資料失敗關閉，對尚未入帳的 orphaned 觀測可安全恢復候選狀態。

**Tech Stack:** TypeScript、Node test runner、CockroachDB/PostgreSQL、私有 HTTPS Ledger API。

## Global Constraints

- 任何一般使用者帳戶都不得由修正流程被自動扣成負數，亦不得在重組時寫入反向 posting。
- 不得修改既有不可變 `ledger_transactions`／`ledger_postings`；不新增可變餘額來源。
- 只處理 `block_height <= head - reorgWindow` 的官方資產事件，並仍需符合資產最小確認數。
- 每個 RPC 回傳事件的 `blockHeight` 必須是安全整數，且嚴格位於本輪請求區間 `[fromBlock, toBlock]`；超出範圍或格式錯誤代表供應商回應不可信，該網路本輪必須失敗關閉，不能觀測、不能入帳、不能影響游標。
- 深度重組與 orphaned+receipt 都必須使該掃描失敗、健康檢查不 ready；不能寫新游標、不能呼叫 creditor。
- 未入帳 orphaned 事件在重新出現於正史時才可恢復為候選；已有 receipt 的事件絕不自動恢復或重新信用。
- 專用資料庫測試只允許 `/hidotpay_test`；未設定或資料庫不存在只能安全 skip，不得觸及正式資料庫。
- 完成使用者可見或發布變動時更新版本、繁體中文 CHANGELOG 和缺口文件；資金開關持續關閉。

---

### Task 1: 掃描器安全水位與深度重組失敗關閉

**Files:**
- Modify: `services/deposit-worker/src/scanner.ts`
- Modify: `services/deposit-worker/tests/scan.test.ts`
- Modify: `services/deposit-worker/tests/run-configured-network.test.ts` if its expected range changes

**Interfaces:**
- `DepositScanStore` no longer exposes normal-path `invalidateFrom`; it exposes `assertNoOrphanedCredits(network): Promise<void>` and `upsertObservation(observation): Promise<'creditable' | 'already_credited'>`.
- `DepositScanner.scan` keeps its current result shape but never saves a cursor above `head - reorgWindow`.

- [ ] **Step 1: Write focused failing tests for safe-head range, no credit before the safety window, later exactly-once credit, and deep reorg with no writes or creditor call.**

```ts
adapter.head = 10;
await scanner.scan([target], 7);
assert.deepEqual(adapter.queries[0], { fromBlock: 7, toBlock: 8, ...expectedQuery });
assert.equal(credited.length, 1);
assert.equal((await store.cursor(adapter.network))?.height, 8);

adapter.reorged = true;
await assert.rejects(() => scanner.scan([target], 7), /deep_chain_reorg_detected/);
assert.equal(credited.length, 1);
assert.equal((await store.cursor(adapter.network))?.height, 8);
```

- [ ] **Step 2: Run focused test and confirm it fails because the current scanner saves the unsafe head and invalidates observations.**

Run: `npm test --workspace=@hidotpay/deposit-worker -- tests/scan.test.ts`

Expected: failure on unsafe `toBlock`/cursor or reorg invalidation behavior.

- [ ] **Step 3: Implement the safe-watermark scan and fail-closed hash check.**

```ts
const safeHead = head - this.config.reorgWindow;
if (safeHead < firstBlock) return { candidates: 0, fromBlock: firstBlock, head, reorgRecovered: false };
if (cursor && await this.adapter.getBlockHash(cursor.height) !== cursor.blockHash) {
  throw new Error('deep_chain_reorg_detected');
}
const fromBlock = cursor ? cursor.height + 1 : firstBlock;
const toBlock = Math.min(safeHead, fromBlock + maxBlockRange - 1);
```

Call `assertNoOrphanedCredits` before network queries. Call creditor only after `upsertObservation` returns `creditable`; call `markCredited` only after creditor succeeds.

- [ ] **Step 4: Run focused scanner and configured-network tests.**

Run: `npm test --workspace=@hidotpay/deposit-worker -- tests/scan.test.ts tests/run-configured-network.test.ts`

Expected: all focused tests pass.

- [ ] **Step 5: Commit the scanner boundary.**

```bash
git add services/deposit-worker/src/scanner.ts services/deposit-worker/tests/scan.test.ts services/deposit-worker/tests/run-configured-network.test.ts
git commit -m '修正充值掃描安全水位與深度重組停機'
```

### Task 1b: RPC 事件安全範圍驗證

**Files:**
- Modify: `services/deposit-worker/src/scanner.ts`
- Modify: `services/deposit-worker/tests/scan.test.ts`

**Interfaces:**
- `DepositScanner.scan` accepts an adapter event only when `blockHeight` is a safe integer in the exact requested inclusive range. Events outside that range are an untrusted provider protocol breach: the entire scan rejects before any write, credit, or cursor advance.

- [ ] **Step 1: Write the failing regression test.**

```ts
adapter.head = 50;
adapter.transferOverride = [{ ...canonicalEvent, blockHeight: 30 }];
await assert.rejects(() => scanner.scan([target], 7), /chain_transfer_outside_requested_range/);
assert.deepEqual(credited, []);
assert.deepEqual(store.observations(), []);
assert.equal(await store.cursor(adapter.network), undefined);
```

- [ ] **Step 2: Run the focused test and confirm it fails because the scanner currently computes confirmations and credits the out-of-range event.**

Run: `npm test --workspace=@hidotpay/deposit-worker -- tests/scan.test.ts`

Expected: failure because the current scanner credits the height-30 event even though the query ended at height 18.

- [ ] **Step 3: Implement the smallest validation before confirmation counting and store writes.**

```ts
if (!Number.isSafeInteger(event.blockHeight) || event.blockHeight < fromBlock || event.blockHeight > toBlock) {
  throw new Error('chain_transfer_outside_requested_range');
}
```

- [ ] **Step 4: Run focused scanner tests and typecheck.**

Run: `npm test --workspace=@hidotpay/deposit-worker -- tests/scan.test.ts && npm run typecheck --workspace=@hidotpay/deposit-worker`

Expected: all tests pass and the unsafe provider event fails the scan without state changes.

- [ ] **Step 5: Commit this bounded regression repair separately.**

```bash
git add services/deposit-worker/src/scanner.ts services/deposit-worker/tests/scan.test.ts docs/superpowers/plans/2026-08-15-deposit-reorg-safety.md
git commit -m '拒絕超出安全範圍的充值事件'
```

### Task 2: PostgreSQL 觀測重放與歷史失效入帳防護

**Files:**
- Modify: `services/deposit-worker/src/postgres-scan-store.ts`
- Modify: `services/deposit-worker/tests/postgres-scan-store.test.ts`
- Modify: `services/deposit-worker/src/cli/run-deposit-worker.ts` only if a specific deep-reorg error needs distinct operational logging

**Interfaces:**
- `assertNoOrphanedCredits(network)` rejects `orphaned_credited_deposit_detected` when `chain_deposit_observations` has `status='orphaned'` and a matching `deposit_receipts` record.
- `upsertObservation` returns `creditable` for a new/finalized/uncredited restored observation and `already_credited` only for a current credited observation.

- [ ] **Step 1: Write failing SQL-store tests for historical orphaned+receipt rejection, orphaned-without-receipt revival, credited deduplication, and no caller-controlled SQL.**

```ts
await pool.query(`UPDATE chain_deposit_observations SET status = 'orphaned' WHERE id = $1`, [observationId]);
await pool.query(`INSERT INTO deposit_receipts (...) VALUES (...)`, receiptParameters);
await assert.rejects(() => store.assertNoOrphanedCredits(network), /orphaned_credited_deposit_detected/);
assert.equal(await store.upsertObservation(uncreditedOrphan), 'creditable');
assert.equal(await store.upsertObservation(creditedObservation), 'already_credited');
```

- [ ] **Step 2: Run focused test and confirm it fails under the current `ON CONFLICT DO NOTHING` / orphaning implementation.**

Run: `npm test --workspace=@hidotpay/deposit-worker -- tests/postgres-scan-store.test.ts`

Expected: tests fail or safely skip without `HIDOTPAY_TEST_DATABASE_URL`; with the dedicated URL, old behavior cannot revive uncredited orphaned records or reject orphaned receipts.

- [ ] **Step 3: Implement parameterized historical guard and only safe orphan revival.**

```ts
const historical = await this.pool.query(
  `SELECT 1 FROM chain_deposit_observations AS observations
     JOIN deposit_receipts AS receipts ON receipts.network = observations.network
       AND receipts.transaction_hash = observations.transaction_hash
       AND receipts.output_index = observations.event_index
    WHERE observations.network = $1 AND observations.status = 'orphaned' LIMIT 1`,
  [network],
);
if (historical.rowCount) throw new Error('orphaned_credited_deposit_detected');
```

Use fixed SQL and bound values to restore only a matching `orphaned` observation after the guard confirms no receipt.

- [ ] **Step 4: Run focused store test, typecheck, and safe integration runner.**

Run: `npm test --workspace=@hidotpay/deposit-worker -- tests/postgres-scan-store.test.ts && npm run typecheck --workspace=@hidotpay/deposit-worker && npm run test:integration --workspace=@hidotpay/deposit-worker`

Expected: typecheck passes; dedicated DB cases pass when configured or skip without a dedicated URL.

- [ ] **Step 5: Commit the PostgreSQL protection.**

```bash
git add services/deposit-worker/src/postgres-scan-store.ts services/deposit-worker/tests/postgres-scan-store.test.ts services/deposit-worker/src/cli/run-deposit-worker.ts
git commit -m '防止重組失效充值繼續入帳'
```

### Task 3: 整體回歸、運維說明與安全發布

**Files:**
- Modify: `docs/operations/reconciliation-worker.md` or create `docs/operations/deposit-reorg-response.md`
- Modify: `docs/phase-1-gaps.md`
- Modify: `CHANGELOG.md`
- Modify: root/App version metadata from 0.2.55 to the next patch
- Test: `services/deposit-worker/tests/*.test.ts`
- Test: `services/ledger-api/tests/integration/transfer-repository.test.ts`

- [ ] **Step 1: 寫入繁中深度重組處置：停止該網路掃描、保存 RPC/區塊證據、對帳 receipt/ledger/Blnk、雙人批准後才恢復；禁止手動修改總帳。**

- [ ] **Step 2: 完整執行所有驗收與安全資料庫檢查。**

Run: `npm test && npm run typecheck && npm run build && npm run verify:docs && npm run test:integration && npm test --prefix app && npm run typecheck --prefix app && git diff --check`

Expected: unit/build/doc checks均成功；整合測試只使用專用測試資料庫或安全 skip，絕不連正式資料庫。

- [ ] **Step 3: 更新版本、提交、最終獨立審查後才推送。**

```bash
git add -A
git commit -m '發布 0.2.56：修正充值鏈重組入帳安全'
git push -u origin codex/financial-core
gh pr edit 1 --title '發布 0.2.56：修正充值鏈重組入帳安全'
```
