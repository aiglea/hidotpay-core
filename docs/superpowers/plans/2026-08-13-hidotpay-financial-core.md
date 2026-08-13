# HiDot Pay Financial Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify a CockroachDB-backed, auditable financial ledger API for development use, with Traditional Chinese OpenAPI documentation.

**Architecture:** A standalone TypeScript Fastify service owns all ledger rules. CockroachDB stores append-only double-entry journal rows and balance projections in a single serializable transaction. The API remains stateless, so it can horizontally scale behind a load balancer; deferred work is emitted through a transactional outbox.

**Tech Stack:** Node.js 22, TypeScript, Fastify, Zod, PostgreSQL `pg` driver, CockroachDB, Node test runner, OpenAPI 3.1.

## Global Constraints

- Never place CockroachDB credentials, certificates, access tokens, private keys, or real customer data in Git, documentation examples, test fixtures, or logs.
- All monetary amounts are decimal integer strings in the asset's smallest unit; JavaScript `number` is forbidden for stored or transferred money values.
- Every write endpoint requires an `Idempotency-Key`; repeated equivalent requests return their original outcome.
- Production mode requires Logto JWT configuration and rejects development actor headers.
- API response JSON is `snake_case`; human-readable documentation is Traditional Chinese.
- No migration may update or delete committed ledger journal rows.

---

### Task 1: Create the isolated financial-core workspace contract

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `services/ledger-api/package.json`
- Create: `services/ledger-api/tsconfig.json`
- Create: `services/ledger-api/src/config.ts`
- Create: `services/ledger-api/tests/config.test.ts`

**Interfaces:**
- Produces `npm run test`, `npm run typecheck`, `npm run build`, and `npm run verify:docs`.
- Produces `loadConfig(env)` which rejects unsafe production configuration.

- [ ] **Step 1: Write failing configuration tests**

```ts
test('production requires Logto audience and database URL', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x' }));
});

test('development accepts no database URL for pure unit tests', () => {
  assert.equal(loadConfig({ NODE_ENV: 'test' }).environment, 'test');
});
```

- [ ] **Step 2: Run the configuration tests and verify failure**

Run: `npm test -- services/ledger-api/tests/config.test.ts`

Expected: FAIL because the workspace and `loadConfig` do not exist.

- [ ] **Step 3: Implement the minimum workspace and configuration module**

```ts
export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const environment = env.NODE_ENV ?? 'development';
  if (environment === 'production' && (!env.DATABASE_URL || !env.LOGTO_AUDIENCE)) {
    throw new Error('production requires DATABASE_URL and LOGTO_AUDIENCE');
  }
  return { environment, databaseUrl: env.DATABASE_URL };
}
```

- [ ] **Step 4: Verify test, typecheck, and build**

Run: `npm test -- services/ledger-api/tests/config.test.ts && npm run typecheck && npm run build`

Expected: exit code 0.

- [ ] **Step 5: Commit the workspace contract**

```bash
git add package.json tsconfig.json .gitignore services/ledger-api
git commit -m "feat: scaffold financial core service"
```

### Task 2: Add safe CockroachDB schema migrations

**Files:**
- Create: `services/ledger-api/migrations/001_financial_core.sql`
- Create: `services/ledger-api/src/migrations.ts`
- Create: `services/ledger-api/tests/migrations.test.ts`
- Create: `services/ledger-api/.env.example`

**Interfaces:**
- Produces `applyMigrations(pool)` which records one immutable migration checksum per migration.
- Produces `assets`, `accounts`, `account_balances`, `ledger_transactions`, `ledger_postings`, `idempotency_records`, `withdrawal_requests`, and `outbox_events` tables.

- [ ] **Step 1: Write failing migration safety tests**

```ts
test('financial migration contains no destructive DDL', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  assert.doesNotMatch(sql, /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i);
  assert.match(sql, /CREATE TABLE ledger_transactions/);
  assert.match(sql, /CREATE TABLE ledger_postings/);
});
```

- [ ] **Step 2: Run migration tests and verify failure**

Run: `npm test -- services/ledger-api/tests/migrations.test.ts`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Implement the migration and migration runner**

```sql
CREATE TABLE ledger_transactions (
  id UUID PRIMARY KEY,
  idempotency_key STRING UNIQUE NOT NULL,
  request_hash STRING NOT NULL,
  transaction_type STRING NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 4: Verify migration safety tests**

Run: `npm test -- services/ledger-api/tests/migrations.test.ts`

Expected: exit code 0.

- [ ] **Step 5: Commit migrations**

```bash
git add services/ledger-api/migrations services/ledger-api/src/migrations.ts services/ledger-api/tests/migrations.test.ts services/ledger-api/.env.example
git commit -m "feat: add immutable ledger schema"
```

### Task 3: Implement money parsing, ledger posting, and idempotency domain rules

**Files:**
- Create: `services/ledger-api/src/domain/money.ts`
- Create: `services/ledger-api/src/domain/idempotency.ts`
- Create: `services/ledger-api/src/domain/ledger.ts`
- Create: `services/ledger-api/tests/domain/money.test.ts`
- Create: `services/ledger-api/tests/domain/ledger.test.ts`

**Interfaces:**
- Produces `parsePositiveAtoms(value: string): bigint`.
- Produces `buildInternalTransfer(input): LedgerTransaction` with two balanced postings.
- Produces `requestHash(value): string` using a canonical JSON representation.

- [ ] **Step 1: Write failing domain tests**

```ts
test('internal transfer emits equal debit and credit postings', () => {
  const tx = buildInternalTransfer({ assetCode: 'USDT', amountAtoms: '1000000', fromAccountId: a, toAccountId: b });
  assert.equal(tx.postings[0].amountAtoms + tx.postings[1].amountAtoms, 0n);
});

test('rejects decimal, zero, negative, and unsafe money inputs', () => {
  for (const value of ['1.2', '0', '-1', '1e3']) assert.throws(() => parsePositiveAtoms(value));
});
```

- [ ] **Step 2: Run domain tests and verify failure**

Run: `npm test -- services/ledger-api/tests/domain`

Expected: FAIL because the domain modules do not exist.

- [ ] **Step 3: Implement minimal pure domain modules**

```ts
export function parsePositiveAtoms(value: string): bigint {
  if (!/^[1-9][0-9]*$/.test(value)) throw new DomainError('invalid_amount');
  return BigInt(value);
}
```

- [ ] **Step 4: Verify domain tests and full unit suite**

Run: `npm test`

Expected: exit code 0.

- [ ] **Step 5: Commit ledger domain rules**

```bash
git add services/ledger-api/src/domain services/ledger-api/tests/domain
git commit -m "feat: enforce ledger money and posting rules"
```

### Task 4: Implement repository transactions and internal-transfer API

**Files:**
- Create: `services/ledger-api/src/db.ts`
- Create: `services/ledger-api/src/repositories/ledger-repository.ts`
- Create: `services/ledger-api/src/services/transfer-service.ts`
- Create: `services/ledger-api/src/http/app.ts`
- Create: `services/ledger-api/src/http/errors.ts`
- Create: `services/ledger-api/src/http/auth.ts`
- Create: `services/ledger-api/src/server.ts`
- Create: `services/ledger-api/tests/http/internal-transfers.test.ts`
- Create: `services/ledger-api/tests/integration/transfer-repository.test.ts`

**Interfaces:**
- Consumes `Idempotency-Key`, authenticated actor, and an internal transfer body.
- Produces `POST /v1/internal-transfers` with `201`, replayed `200`, insufficient-funds `409`, and conflicting key `409` outcomes.
- Produces `GET /healthz`.

- [ ] **Step 1: Write failing route and repository tests**

```ts
test('same idempotency key returns the original transfer without a second debit', async () => {
  const first = await app.inject({ method: 'POST', url: '/v1/internal-transfers', headers, payload });
  const replay = await app.inject({ method: 'POST', url: '/v1/internal-transfers', headers, payload });
  assert.equal(first.statusCode, 201);
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.json().transfer_id, first.json().transfer_id);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- services/ledger-api/tests/http/internal-transfers.test.ts`

Expected: FAIL because no API application exists.

- [ ] **Step 3: Implement serializable repository transaction and routes**

```ts
await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
// lock balance rows, write transaction + postings + balances + outbox in this transaction
await client.query('COMMIT');
```

- [ ] **Step 4: Verify unit and CockroachDB integration tests**

Run: `npm test && DATABASE_URL="$DATABASE_URL" npm run test:integration`

Expected: all tests pass; integration tests skip with an explicit message when `DATABASE_URL` is absent.

- [ ] **Step 5: Commit transfer API**

```bash
git add services/ledger-api/src services/ledger-api/tests
git commit -m "feat: add idempotent internal transfer API"
```

### Task 5: Add deposit and withdrawal state transitions

**Files:**
- Create: `services/ledger-api/src/services/deposit-service.ts`
- Create: `services/ledger-api/src/services/withdrawal-service.ts`
- Create: `services/ledger-api/tests/domain/withdrawal.test.ts`
- Create: `services/ledger-api/tests/http/deposits.test.ts`
- Create: `services/ledger-api/tests/http/withdrawals.test.ts`

**Interfaces:**
- Produces confirmed deposit deduplication by `network + transaction_hash + output_index`.
- Produces withdrawal states `pending_review`, `approved`, `broadcast`, `confirmed`, `rejected`, and `failed`.
- Produces an outbox event for approved withdrawals without signing a transaction.

- [ ] **Step 1: Write failing state-machine and duplicate-deposit tests**

```ts
test('failed withdrawal returns frozen atoms through a new balanced ledger transaction', () => {
  const transitions = withdrawalFailureTransactions(request);
  assert.equal(sumPostings(transitions), 0n);
});

test('duplicate confirmed chain transaction cannot credit twice', async () => {
  assert.equal((await confirmDeposit(input)).status, 'credited');
  assert.equal((await confirmDeposit(input)).status, 'replayed');
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- services/ledger-api/tests/domain/withdrawal.test.ts services/ledger-api/tests/http/deposits.test.ts`

Expected: FAIL because deposit and withdrawal modules do not exist.

- [ ] **Step 3: Implement the state machine and protected routes**

```ts
const allowed: Record<WithdrawalStatus, WithdrawalStatus[]> = {
  pending_review: ['approved', 'rejected'], approved: ['broadcast', 'failed'], broadcast: ['confirmed', 'failed'], confirmed: [], rejected: [], failed: []
};
```

- [ ] **Step 4: Verify all service and integration tests**

Run: `npm test && DATABASE_URL="$DATABASE_URL" npm run test:integration`

Expected: exit code 0.

- [ ] **Step 5: Commit funding state transitions**

```bash
git add services/ledger-api/src services/ledger-api/tests
git commit -m "feat: add deposit and withdrawal controls"
```

### Task 6: Publish API contract and operational documentation

**Files:**
- Create: `docs/overview/quick-start.md`
- Create: `docs/api/openapi.yaml`
- Create: `docs/api/README.md`
- Create: `docs/architecture/financial-core.md`
- Create: `docs/guides/security-model.md`
- Create: `docs/guides/operations.md`
- Create: `services/ledger-api/scripts/verify-docs.mjs`
- Create: `services/ledger-api/tests/docs-contract.test.ts`

**Interfaces:**
- Produces a valid OpenAPI 3.1 document covering health, balances, transfers, deposits, and withdrawals.
- Produces a docs.rw-inspired reading order: Overview, Quick start, API, Guides.
- Produces `npm run verify:docs`.

- [ ] **Step 1: Write failing documentation contract tests**

```ts
test('OpenAPI documents every registered financial route', async () => {
  const documented = loadOpenApiPaths();
  for (const route of await listFinancialRoutes(app)) assert.ok(documented.has(route));
});
```

- [ ] **Step 2: Run documentation tests and verify failure**

Run: `npm test -- services/ledger-api/tests/docs-contract.test.ts`

Expected: FAIL because the OpenAPI document does not exist.

- [ ] **Step 3: Write OpenAPI and Traditional Chinese documentation**

```yaml
/v1/internal-transfers:
  post:
    summary: 平台內部轉帳
    parameters:
      - $ref: '#/components/parameters/IdempotencyKey'
```

- [ ] **Step 4: Verify documents and full suite**

Run: `npm run verify:docs && npm test && npm run typecheck && npm run build`

Expected: exit code 0.

- [ ] **Step 5: Commit API documentation**

```bash
git add docs services/ledger-api/scripts services/ledger-api/tests/docs-contract.test.ts
git commit -m "docs: publish financial core API contract"
```

### Task 7: Run CockroachDB development validation and final review

**Files:**
- Modify: `services/ledger-api/README.md`
- Modify: `docs/guides/operations.md`
- Create: `docs/reports/2026-08-13-financial-core-validation.md`

**Interfaces:**
- Produces non-secret local bootstrap directions.
- Produces validation evidence for migrations and integration tests against the supplied development cluster.

- [ ] **Step 1: Add a failing secret-leak test**

```ts
test('tracked files do not contain Cockroach connection secrets', () => {
  const tracked = execFileSync('git', ['grep', '-I', '-n', '-E', 'postgres(ql)?://[^ ]*:[^ ]*@|ZfdCz'], { encoding: 'utf8' });
  assert.equal(tracked, '');
});
```

- [ ] **Step 2: Run test and verify failure or expected empty Git output**

Run: `npm test -- services/ledger-api/tests/security.test.ts`

Expected: the test exists and passes only when secrets are absent from tracked files.

- [ ] **Step 3: Apply migrations through an ephemeral environment variable and run integration tests**

```bash
DATABASE_URL="$DATABASE_URL" npm run db:migrate
DATABASE_URL="$DATABASE_URL" npm run test:integration
```

- [ ] **Step 4: Run complete verification**

Run: `npm run verify:docs && npm test && npm run typecheck && npm run build && git diff --check`

Expected: exit code 0.

- [ ] **Step 5: Commit validated documentation and evidence**

```bash
git add services/ledger-api/README.md docs/guides/operations.md docs/reports/2026-08-13-financial-core-validation.md
git commit -m "test: validate financial core against CockroachDB"
```
