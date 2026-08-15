# HiDot Pay Workers Hyperdrive Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` and complete one checked task at a time, including its listed verification before the next task.

**Goal:** Replace the Cloudflare Container database path with a Workers-native, Hyperdrive-backed ledger API without changing any double-entry, idempotency, authentication, custody, P2P, or withdrawal safety rule.

**Architecture:** Keep `services/ledger-api` as the source of truth for domain services and PostgreSQL repositories. Add a Workers-native HTTP adapter in `services/edge-api` that creates a `pg` client from `env.HYPERDRIVE.connectionString`, dispatches only explicitly mapped Fetch routes, and never imports or starts Fastify. The existing Container Worker remains API-disabled until every mapped route has parity tests and staging authentication evidence.

**Tech Stack:** Cloudflare Workers, Hyperdrive, CockroachDB, `pg@8.23.0`, jose, Zod, Node test runner.

## Global Constraints

- `WITHDRAWALS_ENABLED=false` remains the default and must be asserted in every Worker deployment test.
- No Worker, source file, test fixture, log, or Secret may contain a private key, seed, mnemonic, or signing payload.
- `DATABASE_URL` is never added to `wrangler.jsonc`; only the Hyperdrive binding is configured there.
- All money values remain decimal-free atom strings and all balance changes use the existing `TransferService` or `FundingService`.
- A request lacking a valid Logto bearer token must not create a pool, wallet, address, transfer, order, or fee quote.
- Every money-changing route requires its existing idempotency header and keeps its current error code and status behavior.

## File Structure

- `services/edge-api/src/native-ledger-worker.ts`: Fetch-native Worker entry and explicit route dispatch.
- `services/edge-api/src/native-ledger-runtime.ts`: builds per-request repository and service dependencies from Hyperdrive and secrets.
- `services/edge-api/src/native-response.ts`: turns `DomainError` and Zod validation failures into the existing public error contract.
- `services/edge-api/tests/native-ledger-worker.test.mjs`: static boundary tests and request-level Worker tests with a fake runtime.
- `services/edge-api/wrangler-native-ledger-staging.jsonc`: isolated staging Worker configuration with a Hyperdrive binding and both money gates disabled.
- `services/ledger-api/src/http/app.ts`: remains the behavioral reference until all routes are migrated; do not delete it in this plan.

### Task 1: Create a no-money native Worker runtime boundary

**Files:**

- Create: `services/edge-api/src/native-ledger-runtime.ts`
- Create: `services/edge-api/tests/native-ledger-worker.test.mjs`
- Modify: `services/edge-api/package.json`

- [ ] Write a failing test asserting that a missing bearer token returns `401` before `createRuntime` is called.
- [ ] Add `createNativeLedgerHandler({ createRuntime })`, whose `GET /healthz` returns `{ status: 'ok' }`, whose non-`/v1/` path returns `404`, and whose protected routes reject absent authorization with `401`.
- [ ] Run `npm test --workspace=@hidotpay/edge-api`; expected result: all edge tests pass.
- [ ] Run `npm run typecheck --workspace=@hidotpay/edge-api`; expected result: no diagnostics.

### Task 2: Bind Hyperdrive without exposing a database URL

**Files:**

- Create: `services/edge-api/wrangler-native-ledger-staging.jsonc`
- Modify: `services/edge-api/tests/native-ledger-worker.test.mjs`

- [ ] Write a failing configuration test requiring a `HYPERDRIVE` binding, `nodejs_compat`, `LEDGER_API_ENABLED=false`, `WITHDRAWALS_ENABLED=false`, and prohibiting `DATABASE_URL` and any PostgreSQL URL literal.
- [ ] Add the isolated Worker configuration using Hyperdrive config `hidotpay-ledger-staging`; no runtime Secret is placed in the file.
- [ ] Deploy only the health/unauthenticated gate to `hidotpay-native-ledger-staging` and verify `/healthz` is 200 while `GET /v1/me/wallet` without a bearer token is 401.

### Task 3: Reuse authentication and error contracts in Fetch form

**Files:**

- Create: `services/edge-api/src/native-response.ts`
- Modify: `services/edge-api/src/native-ledger-worker.ts`
- Test: `services/ledger-api/tests/http/auth.test.ts`

- [ ] Write failing tests for malformed bearer, unavailable discovery, wrong issuer/audience, Zod body failure, and `DomainError('forbidden')` response shape.
- [ ] Reuse `createAuthenticator` and `requireRole` from `services/ledger-api/src/http/auth.ts`; do not duplicate JWT parsing.
- [ ] Map `DomainError` and Zod failures to the same public status/body already asserted in ledger HTTP tests.
- [ ] Verify Ledger auth tests plus native Worker tests pass before enabling any database route.

### Task 4: Migrate read-only wallet routes

**Files:**

- Modify: `services/edge-api/src/native-ledger-runtime.ts`
- Modify: `services/edge-api/src/native-ledger-worker.ts`
- Test: `services/ledger-api/tests/http/phase1-custody.test.ts`, `services/ledger-api/tests/http/wallet-addresses.test.ts`

- [ ] Implement only `GET /v1/me/wallet`, `GET /v1/me/balances`, and `GET /v1/accounts/:accountId/balances` using `PostgresLedgerRepository`.
- [ ] Use `env.HYPERDRIVE.connectionString` exclusively to create the `pg` pool; close the client in `finally`.
- [ ] Assert cross-owner balance reads return `account_not_owned`, and no response includes custody material.
- [ ] Prove the routes against a dedicated integration database before staging deployment.

### Task 5: Migrate internal transfer and fee-quote routes

**Files:**

- Modify: `services/edge-api/src/native-ledger-worker.ts`
- Test: `services/ledger-api/tests/http/internal-transfers.test.ts`, `services/ledger-api/tests/services/risk-service.test.ts`

- [ ] Map `POST /v1/internal-transfers`, `POST /v1/me/internal-transfers`, and `POST /v1/withdrawal-fee-quotes` to existing `TransferService` and `FundingService`.
- [ ] Require `Idempotency-Key`; pass it unchanged to existing services; never accept caller-supplied actor identities.
- [ ] Re-run concurrent CockroachDB transfer integration checks and assert no non-platform account becomes negative.

### Task 6: Migrate P2P and encrypted payment-method routes

**Files:**

- Modify: `services/edge-api/src/native-ledger-runtime.ts`
- Modify: `services/edge-api/src/native-ledger-worker.ts`
- Test: `services/ledger-api/tests/http/p2p-ads.test.ts`, `services/ledger-api/tests/http/p2p-orders.test.ts`, `services/ledger-api/tests/http/p2p-payment-methods.test.ts`

- [ ] Map ads, orders, actions, disputes, resolutions, and payment-method endpoints one-for-one.
- [ ] Instantiate `OpenBaoP2PPaymentCryptographer` only from Worker Secrets; never return encrypted or raw payment account data.
- [ ] Assert arbitrator-only actions, escrow balance, timeout, and masked admin projection invariants.

### Task 7: Migrate private address and deposit/withdrawal boundaries

**Files:**

- Modify: `services/edge-api/src/native-ledger-runtime.ts`
- Modify: `services/edge-api/src/native-ledger-worker.ts`
- Test: `services/ledger-api/tests/http/wallet-addresses.test.ts`, `services/ledger-api/tests/http/phase1-custody.test.ts`

- [ ] Permit address derivation only through the private signer service identity.
- [ ] Permit deposit confirmation only to `chain_worker` role.
- [ ] Keep withdrawal creation and approval disabled until signer, OpenBao, whitelist, risk limits, Blnk reconciliation, and dual-control evidence are available.

### Task 8: Staging parity, observability, and controlled cutover

**Files:**

- Modify: `services/edge-api/docs/staging-deployment.md`
- Modify: `docs/operations/`

- [ ] Add authenticated staging smoke tests for every migrated endpoint, with unique test actor, idempotency key, and dedicated test database URL.
- [ ] Add structured request IDs, no-secret error logs, Cloudflare deployment version, and rollback command evidence.
- [ ] Do not change `LEDGER_API_ENABLED` or `WITHDRAWALS_ENABLED` until all test suites, integration tests, load test, signer isolation, OpenBao HA, Blnk HA, and incident rollback drill are evidenced.

## Completion Evidence

- Every Fastify `/v1/` route has a Fetch-native parity test and an authenticated staging test.
- CockroachDB integration tests use a dedicated non-production database and prove balance, idempotency, escrow, and withdrawal invariants.
- The native Worker uses Hyperdrive; the Container no longer needs direct database egress.
- Private signing stays outside Workers and no deployment artifact contains key material.
- Staging remains no-withdrawal until the explicit production gate evidence exists.
