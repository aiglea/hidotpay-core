# Figma 錢包引導頁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依 Figma 節點 `1019:16230` 將 hidotpay 未登入頁改為可操作、安全且手機優先的錢包引導介面。

**Architecture:** 既有 `LoginShell` 保持為 Logto 入口，只替換未登入畫面；真實資產仍只在登入且 API 就緒後的 `WalletHome` 載入。Cloudflare Worker 只服務靜態 SPA，沒有金流連線或私密設定。

**Tech Stack:** Expo、React Native Web、TypeScript、Node test runner、Cloudflare Workers Static Assets。

## Global Constraints

- 依 Figma `KwXwdMAsvu6ZRpvNXm7WCR` 的節點 `1019:16230`，不可顯示 Figma 範例的假金額。
- 不加入 Tailwind、新 UI 套件、emoji、手寫 SVG 或任何私密設定。
- 「略過」與「開始使用」只呼叫 `onSignIn`；未登入轉帳／收款不得呼叫 API。
- 忙碌／錯誤／accessibilityRole／HTTPS redirect 保護不可退化，375px 無水平溢出。
- 版本由 `0.2.56` 升為 `0.2.57`，繁中 CHANGELOG；真實資金功能維持關閉。

---

### Task 1: Figma 引導頁與互動契約

**Files:**
- Modify: `app/src/LoginShell.tsx`
- Modify: `app/tests/project-contract.test.mjs`
- Create: `app/tests/figma-onboarding.test.mjs`

**Interfaces:** 保持既有 `LoginShellProps`。未登入頁的「略過」和「開始使用」均按 `onSignIn`，且 `busy` 時 disabled。

- [ ] **Step 1: 寫入會失敗的 Figma 契約測試。**

```js
test('未登入首頁符合 Figma 引導版型且不顯示假餘額', () => {
  const source = read('src/LoginShell.tsx');
  for (const text of ['安全錢包', '登入後顯示可用資產', '略過', '開始使用', '轉帳', '收款']) assert.match(source, new RegExp(text));
  assert.doesNotMatch(source, /\$12,765\.00/);
  assert.match(source, /onPress=\{onSignIn\}/);
  assert.match(source, /disabled=\{busy\}/);
});
```

- [ ] **Step 2: 跑 RED 測試。**

Run: `npm test --prefix app -- tests/figma-onboarding.test.mjs`

Expected: FAIL on missing Figma copy, not a module error.

- [ ] **Step 3: 最小化改寫未登入 `LoginShell`。**

Use a `#F5F5F5` page, top 「略過」Pressable, decorative grid orb made only from bordered `View`s, a white 1px black-bordered summary card with `安全錢包`/`登入後顯示可用資產`, two disabled `#D7FF00` pills marked `轉帳`/`收款`, then a white 20px-radius onboarding card with title, body, three dots and primary `開始使用` Pressable. Do not add an asset or numeric balance. Keep existing authenticated profile and error state with matching light colors.

- [ ] **Step 4: 跑 GREEN 與型別檢查。**

Run: `npm test --prefix app && npm run typecheck --prefix app`

Expected: all passing.

- [ ] **Step 5: 提交。**

Run: `git add app/src/LoginShell.tsx app/tests/project-contract.test.mjs app/tests/figma-onboarding.test.mjs && git commit -m '依 Figma 重做錢包首次引導頁'`

### Task 2: 靜態 Worker 發佈與版本驗收

**Files:**
- Create: `app/wrangler.wallet-ui.jsonc`
- Modify: `app/README.md`, `app/package.json`, `app/package-lock.json`, `app/app.config.js`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `app/tests/figma-onboarding.test.mjs`

**Interfaces:** 設定只指向 `./dist`，其 `not_found_handling` 必為 `single-page-application`；部署網址是 `https://hidotpay-wallet-ui.lgninhk.workers.dev`，沒有 runtime secrets。

- [ ] **Step 1: 新增會失敗的設定測試。**

```js
test('Cloudflare 錢包 UI 只部署 SPA 靜態資產', () => {
  const config = read('wrangler.wallet-ui.jsonc');
  assert.match(config, /"name": "hidotpay-wallet-ui"/);
  assert.match(config, /"directory": "\.\/dist"/);
  assert.match(config, /"not_found_handling": "single-page-application"/);
  assert.doesNotMatch(config, /DATABASE_URL|TOKEN|SECRET|PRIVATE_KEY/);
});
```

- [ ] **Step 2: 跑 RED 測試。**

Run: `npm test --prefix app -- tests/figma-onboarding.test.mjs`

Expected: FAIL because `wrangler.wallet-ui.jsonc` is absent.

- [ ] **Step 3: 建立設定並升至 0.2.57。**

Create config with `name` `hidotpay-wallet-ui`, compatibility date `2026-08-15`, `workers_dev: true`, and `assets` directory `./dist` with SPA handling. Update root/App manifests, both lockfiles, Expo config, README and Chinese CHANGELOG. State visual UI only; real assets remain disabled.

- [ ] **Step 4: 建置、渲染驗收與部署。**

Run: `npm test --prefix app && npm run typecheck --prefix app && cd app && npx expo export --platform web --output-dir dist && npx --no-install wrangler deploy --config wrangler.wallet-ui.jsonc --message '發布 0.2.57：依 Figma 更新錢包引導頁'`

Expected: tests pass, deployment returns Version ID, rendered 375px and desktop URL have no overflow and expose both sign-in entries. Without Logto HTTPS allowlist proof, do not claim end-to-end sign-in verified.

- [ ] **Step 5: 提交。**

Run: `git add app/wrangler.wallet-ui.jsonc app/README.md app/package.json app/package-lock.json app/app.config.js package.json package-lock.json CHANGELOG.md app/tests/figma-onboarding.test.mjs && git commit -m '發布 0.2.57：依 Figma 更新錢包引導頁'`
