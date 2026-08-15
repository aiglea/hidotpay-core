# Figma Wallet MVP UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the Figma-aligned hidotpay onboarding, secure authentication entry, wallet home and multi-chain deposit UI without presenting invented financial data.

**Architecture:** Keep the existing Expo Router application and Logto SDK. Add focused screen components and shared visual tokens; views call the existing typed wallet API only after OIDC authentication. Figma exports are committed as immutable visual reference assets while forms and statuses remain accessible native components.

**Tech Stack:** Expo, React Native Web, TypeScript, Logto React / React Native SDK, Cloudflare Workers static assets, Node test runner.

## Global Constraints

- Use Figma file `KwXwdMAsvu6ZRpvNXm7WCR`, with 375×812 frames as visual source.
- Use only real API balances, addresses and transaction history; never insert sample amounts or addresses.
- Ethereum and TRON are the only selectable deposit networks in this phase.
- Start login and registration with OIDC authorization code flow; never collect a password in the hidotpay app.
- Keep the static UI Worker free of database bindings, private keys, mnemonic, seed and API tokens.
- All user-visible copy is Traditional Chinese.
- Increment versions before a deployed UI release and commit with a Traditional Chinese message.

---

### Task 1: Establish the UI contract

**Files:**
- Create: `app/tests/figma-wallet-flow.test.mjs`
- Modify: `app/tests/figma-onboarding.test.mjs`

**Interfaces:** Consumes `LoginShell` and `WalletHome`; produces source-level requirements for Figma routes and safe data states.

- [ ] **Step 1: Write failing test**

Require an `OnboardingFlow` that exposes `登入`, `建立帳戶`, `Ethereum`, `TRON`, `取得充值地址`, and a no-fake-balance rule. Require separate `onSignIn` and `onSignUp` callbacks on the signed-out shell.

- [ ] **Step 2: Verify RED**

Run `node --no-warnings --test app/tests/figma-wallet-flow.test.mjs`. Expected: failure because flow component and distinct callbacks do not exist.

- [ ] **Step 3: Commit test contract**

Run `git add app/tests/figma-wallet-flow.test.mjs app/tests/figma-onboarding.test.mjs && git commit -m '建立 Figma 錢包前台流程驗收'`.

### Task 2: Build Figma foundations, splash and onboarding

**Files:**
- Create: `app/src/FigmaWalletTheme.ts`
- Create: `app/src/OnboardingFlow.tsx`
- Modify: `app/src/LoginShell.tsx`
- Test: `app/tests/figma-wallet-flow.test.mjs`

**Interfaces:** Consumes `onSignIn(): void`, `onSignUp(): void`, `busy` and optional error; produces `OnboardingFlow` with no credential storage.

- [ ] **Step 1: Keep flow test red**

Run `node --no-warnings --test app/tests/figma-wallet-flow.test.mjs`; it must fail before production code is created.

- [ ] **Step 2: Implement visual foundation**

Create tokens using near-black, warm off-white, acid-lime actions, 12/16/24 radii and tabular financial numbers. Implement a scroll-safe splash and two onboarding cards; `略過` and `開始使用` lead to authentication choice. Motion uses opacity/transform and respects reduced motion.

- [ ] **Step 3: Implement Figma authentication entry**

Replace the existing invented marketing wallet in `LoginShell` with Figma-aligned login and registration entry cards. Buttons invoke props only: no password `TextInput`, no token display, no network request.

- [ ] **Step 4: Verify GREEN**

Run `npm test --prefix app && npm run typecheck --prefix app`. Expected: pass.

- [ ] **Step 5: Commit**

Run `git add app/src/FigmaWalletTheme.ts app/src/OnboardingFlow.tsx app/src/LoginShell.tsx app/tests/figma-wallet-flow.test.mjs && git commit -m '依 Figma 重製錢包引導與登入入口'`.

### Task 3: Separate secure Logto login and registration entry

**Files:**
- Modify: `app/app/index.web.tsx`
- Modify: `app/app/index.native.tsx`
- Test: `app/tests/web-auth-redirect.test.mjs`

**Interfaces:** Consumes LoginShell callbacks and SDK `signIn`; produces normal login authorization and sign-up with `firstScreen: 'register'`.

- [ ] **Step 1: Write failing test**

Require distinct login/sign-up callbacks. Require sign-up to use the Logto sign-in options object with `firstScreen: 'register'`, the registered redirect URI, and no password-bearing fetch request.

- [ ] **Step 2: Verify RED**

Run `node --no-warnings --test app/tests/web-auth-redirect.test.mjs`. Expected: failure because no sign-up callback exists.

- [ ] **Step 3: Implement Web and Native wiring**

Add `beginSignUp` to Web and Native entry files. Web calls `signIn({ redirectUri: webRedirectUri, firstScreen: 'register' })`; Native calls `signIn({ redirectUri: 'hidotpay://callback', firstScreen: 'register' })`. Pass both actions to `LoginShell`.

- [ ] **Step 4: Verify GREEN and commit**

Run `npm test --prefix app && npm run typecheck --prefix app`, then commit with `區分安全登入與註冊入口`.

### Task 4: Rebuild authenticated home and multi-chain top-up

**Files:**
- Modify: `app/src/WalletHome.tsx`
- Modify: `app/tests/wallet-api.test.mjs`
- Modify: `app/tests/figma-wallet-flow.test.mjs`

**Interfaces:** Consumes `getWalletSnapshot`, `allocateDepositAddress`, and `getWalletTransactions`; produces `home | topup | topup-confirmation | history` states.

- [ ] **Step 1: Write failing tests**

Require Ethereum/TRON choices, no address before `allocateDepositAddress` resolves, confirmation only after success, copyable returned address, and no `submitInternalTransfer` action in this first phase.

- [ ] **Step 2: Verify RED**

Run `node --no-warnings --test app/tests/figma-wallet-flow.test.mjs app/tests/wallet-api.test.mjs`. Expected: failure because the current combined action card has no Figma top-up state machine.

- [ ] **Step 3: Implement Figma home and top-up**

Use a single screen state. Home renders only API balances or safe loading/empty/error surfaces. Top-up chooses Ethereum or TRON and asks for an address. Confirmation shows returned network, address, a network-mismatch warning and copy action. Transaction history maps API results; unavailable business functions are hidden rather than shown as false promises.

- [ ] **Step 4: Verify GREEN and commit**

Run `npm test --prefix app && npm run typecheck --prefix app && (cd app && ./node_modules/.bin/expo export --platform web)`, then commit with `依 Figma 完成多鏈充值錢包介面`.

### Task 5: Render, version and deploy

**Files:**
- Modify: `app/package.json`, `app/package-lock.json`, root `package.json`, root `package-lock.json`, `CHANGELOG.md`
- Test: `app/tests/figma-onboarding.test.mjs`

**Interfaces:** Consumes a complete static Expo export and `app/wrangler.wallet-ui.jsonc`; produces a versioned live static UI.

- [ ] **Step 1: Write failing version/layout test**

Require a version above 0.2.58, a Traditional Chinese changelog entry, static-asset-only Worker config, and no API/database/key binding.

- [ ] **Step 2: Verify RED**

Run `npm test --prefix app`. Expected: failure until the release version and changelog change.

- [ ] **Step 3: Release preparation**

Increment all synchronized versions and locks using minimal repository tooling. Add dated Traditional Chinese changelog copy that describes only completed Figma UI and secure OIDC entry.

- [ ] **Step 4: Rendered acceptance**

Run Expo Web on an unused port. Inspect 375×568, 375×812, 390×844, 768px and 1440px for splash, onboarding, login choice, registration choice, home loading/empty, top-up selection/confirmation and transaction empty/error. Verify no horizontal overflow, no product emoji, readable contrast, tap targets, reduced motion and Traditional Chinese strings.

- [ ] **Step 5: Export and deploy**

Run `cd app && ./node_modules/.bin/expo export --platform web`, deploy via the restricted Keychain Cloudflare token and `wrangler.wallet-ui.jsonc`, then confirm `/` and `/callback` return 200 at `https://hidotpay-wallet-ui.lgninhk.workers.dev`.

- [ ] **Step 6: Commit release**

Commit only the checked UI files with `發布 <version>：完成 Figma 錢包前台`.

## Self-Review

- Tasks 2–4 cover every first-phase visible UI flow; Task 3 protects authentication; Task 5 is rendered/live verification.
- Component boundaries are explicit: callbacks in LoginShell, state in OnboardingFlow and WalletHome, network calls only via wallet-api.
- The plan has no financial activation step; UI deployment must not be described as a production custody launch.
