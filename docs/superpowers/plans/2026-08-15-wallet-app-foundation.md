# Wallet App Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the authenticated Expo screen from a login test shell into a safe wallet foundation that shows balances, generates a deposit address only through the authenticated API, and submits an internal transfer with clear non-production states.

**Architecture:** Keep Logto responsible for identity and keep the browser free of secrets. A small typed API client receives the Logto access token at call time and talks only to the configured edge API; the interface is built from reusable React Native components so web and Android render the same flow. If the API is deliberately disabled or unavailable, the page shows a truthful protected state rather than invented balances or a fake successful transfer.

**Tech Stack:** Expo Router, React Native Web, TypeScript, Logto React / React Native, Node test runner.

## Global Constraints

- Do not place private keys, service tokens, database URLs, or Cloudflare credentials in the App.
- Do not turn on `LEDGER_API_ENABLED` or `WITHDRAWALS_ENABLED` as part of this UI work.
- User-facing copy and release notes are Traditional Chinese.
- Wallet API calls require the signed-in user's Logto access token; an unavailable API must be visibly unavailable.
- The supplied Figma node could not be read by the connected account, so do not claim pixel-perfect Figma parity.

---

### Task 1: Define and verify the authenticated wallet API boundary

**Files:**
- Create: `app/src/wallet-api.ts`
- Create: `app/tests/wallet-api.test.mjs`

**Interfaces:**
- Consumes: a base URL, a Logto bearer token, and browser `fetch`.
- Produces: `getWalletSnapshot`, `allocateDepositAddress`, and `submitInternalTransfer`; every function rejects a non-2xx response with the server-safe message.

- [ ] **Step 1: Write the failing test**

```js
test('wallet snapshot sends bearer token to the configured API', async () => {
  const requests = [];
  const { getWalletSnapshot } = await import('../src/wallet-api.ts');
  await getWalletSnapshot({ apiBaseUrl: 'https://api.example.test', accessToken: 'token', fetchImpl: async (url, init) => {
    requests.push({ url, init });
    return new Response(JSON.stringify({ account_id: 'wallet-1', balances: [] }), { status: 200 });
  }});
  assert.equal(requests[0].url, 'https://api.example.test/v1/me/balances');
  assert.equal(requests[0].init.headers.Authorization, 'Bearer token');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -- wallet-api.test.mjs`

Expected: FAIL because `src/wallet-api.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export async function getWalletSnapshot(input: WalletApiInput): Promise<WalletSnapshot> {
  return requestJson<WalletSnapshot>(input, '/v1/me/balances');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm test -- wallet-api.test.mjs`

Expected: PASS with the bearer-token assertion.

### Task 2: Render protected wallet states and actions

**Files:**
- Create: `app/src/WalletHome.tsx`
- Modify: `app/app/index.web.tsx`
- Modify: `app/app/index.native.tsx`
- Modify: `app/tests/project-contract.test.mjs`

**Interfaces:**
- Consumes: signed-in username, access-token supplier, `WalletApi` functions, and `onSignOut`.
- Produces: a loading state, an unavailable/error state, an empty-balance state, a generated deposit-address state, and an internal-transfer submit state.

- [ ] **Step 1: Write the failing test**

```js
test('authenticated routes render the wallet home instead of the login-only shell', () => {
  assert.match(read('app/index.web.tsx'), /<WalletHome/);
  assert.match(read('app/index.native.tsx'), /<WalletHome/);
  assert.match(read('src/WalletHome.tsx'), /充值地址/);
  assert.match(read('src/WalletHome.tsx'), /站內轉帳/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -- project-contract.test.mjs`

Expected: FAIL because `WalletHome` is not imported or rendered.

- [ ] **Step 3: Write minimal implementation**

```tsx
return authenticated ? <WalletHome username={username} accessToken={accessToken} onSignOut={onSignOut} /> : <LoginShell ... />;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm test -- project-contract.test.mjs`

Expected: PASS with both authenticated route assertions.

### Task 3: Wire public configuration and release documentation

**Files:**
- Modify: `app/app.config.js`
- Modify: `app/.env.example`
- Modify: `app/README.md`
- Modify: `docs/phase-1-gaps.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `EXPO_PUBLIC_LEDGER_API_BASE_URL` only; it is a public endpoint, not a credential.
- Produces: documented local configuration and an explicit statement that an API endpoint must be enabled in a protected environment before live wallet actions can work.

- [ ] **Step 1: Write the failing test**

```js
test('wallet API base URL is public configuration and not a secret', () => {
  assert.match(read('app.config.js'), /EXPO_PUBLIC_LEDGER_API_BASE_URL/);
  assert.match(read('.env.example'), /EXPO_PUBLIC_LEDGER_API_BASE_URL/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -- project-contract.test.mjs`

Expected: FAIL because no ledger API base URL is configured.

- [ ] **Step 3: Write minimal implementation**

```js
const ledgerApiBaseUrl = process.env.EXPO_PUBLIC_LEDGER_API_BASE_URL ?? '';
extra: { logtoEndpoint, logtoWebAppId, logtoNativeAppId, ledgerApiBaseUrl },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm test -- project-contract.test.mjs`

Expected: PASS with the public-configuration assertion.

### Task 4: Verify rendered states and publish a versioned candidate

**Files:**
- Modify: `app/package.json`
- Modify: `app/package-lock.json`
- Modify: `app/app.config.js`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Run static verification**

Run: `npm test && npm run typecheck && npm run build && npm run verify:docs`

Expected: all workspace tests, type checks, build, and documentation checks pass.

- [ ] **Step 2: Render and inspect UI states**

Run: `cd app && npm run web`

Expected: inspect logged-out, loading, unavailable, empty-balance, generated-address, transfer validation, and narrow viewport states; do not claim untested live settlement.

- [ ] **Step 3: Commit and push only after verification**

Run: `git add -A && git commit -m '發布 0.2.52：建立使用者錢包介面基礎' && git push origin codex/financial-core`

Expected: branch head equals `origin/codex/financial-core` and the existing draft PR describes the Traditional Chinese release.

## Self-review

- Coverage: the plan covers public configuration, authenticated API boundary, balances, deposit address, internal transfer, unavailable states, docs, tests, responsive visual inspection, and release evidence.
- Intentional gaps: P2P UI, transaction-history API, actual enabled API deployment, private-key signing, and real-money activation remain separate deliveries because the current public API contract or production safety gates are incomplete.
- Type consistency: the only API dependency introduced is the explicitly named `WalletApi` interface/functions; screens receive it through typed props rather than importing secrets or server libraries.
