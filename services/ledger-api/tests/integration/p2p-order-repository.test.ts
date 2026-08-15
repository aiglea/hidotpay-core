import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { Pool } from 'pg';

import { applyMigrations } from '../../src/migrations.js';
import { PostgresP2PAdRepository } from '../../src/repositories/postgres-p2p-ad-repository.js';
import { PostgresP2POrderRepository } from '../../src/repositories/postgres-p2p-order-repository.js';

const databaseUrl = process.env.HIDOTPAY_TEST_DATABASE_URL;

test('CockroachDB P2P order locks, releases, and balances each order exactly once', { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const assetCode = `T${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;
  const sellerId = randomUUID();
  const buyerId = randomUUID();
  const sellerAccountId = randomUUID();
  try {
    await applyMigrations(pool);
    await pool.query('INSERT INTO assets (code, display_name, decimals) VALUES ($1, $2, 6)', [assetCode, assetCode]);
    await pool.query(`INSERT INTO accounts (id, owner_id, account_kind) VALUES ($1, $2, 'user_available')`, [sellerAccountId, sellerId]);
    await pool.query('INSERT INTO account_balances (account_id, asset_code, balance_atoms) VALUES ($1, $2, 2000000)', [sellerAccountId, assetCode]);
    const ads = new PostgresP2PAdRepository(pool);
    const orders = new PostgresP2POrderRepository(pool);
    const ad = await ads.create({ assetCode, fiatCurrency: 'TWD', maxAmountAtoms: '1500000', minAmountAtoms: '1000000', paymentMethodCode: 'bank_transfer', priceAtoms: '32000000', sellerId });
    const create = { adId: ad.id, amountAtoms: '1000000', buyerId, idempotencyKey: `p2p-${randomUUID()}`, requestHash: randomUUID() };
    const order = await orders.create(create);
    const replay = await orders.create(create);
    assert.equal(order.status, 'awaiting_payment');
    assert.equal(replay.id, order.id);
    assert.equal((await pool.query<{ balance_atoms: string }>('SELECT balance_atoms::STRING FROM account_balances WHERE account_id = $1 AND asset_code = $2', [sellerAccountId, assetCode])).rows[0]?.balance_atoms, '1000000');
    await orders.transition({ action: 'buyer_marked_paid', actorId: buyerId, idempotencyKey: `p2p-paid-${randomUUID()}`, orderId: order.id, requestHash: randomUUID() });
    await orders.transition({ action: 'seller_release', actorId: sellerId, idempotencyKey: `p2p-release-${randomUUID()}`, orderId: order.id, requestHash: randomUUID() });
    const buyerBalance = await pool.query<{ balance_atoms: string }>(
      `SELECT balances.balance_atoms::STRING FROM account_balances AS balances
        JOIN accounts ON accounts.id = balances.account_id
       WHERE accounts.owner_id = $1 AND accounts.account_kind = 'user_available' AND balances.asset_code = $2`,
      [buyerId, assetCode],
    );
    assert.equal(buyerBalance.rows[0]?.balance_atoms, '1000000');
    const escrowBalance = await pool.query<{ balance_atoms: string }>('SELECT balance_atoms::STRING FROM account_balances WHERE account_id = $1 AND asset_code = $2', [order.escrowAccountId, assetCode]);
    assert.equal(escrowBalance.rows[0]?.balance_atoms, '0');
    const total = await pool.query<{ total: string }>('SELECT COALESCE(sum(amount_atoms), 0)::STRING AS total FROM ledger_postings WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE transaction_type LIKE $1)', ['p2p_%']);
    assert.equal(total.rows[0]?.total, '0');
  } finally {
    await pool.end();
  }
});

test('CockroachDB timeout refunds only an overdue unpaid P2P order once', { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const assetCode = `T${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;
  const sellerId = randomUUID();
  const buyerId = randomUUID();
  const sellerAccountId = randomUUID();
  try {
    await applyMigrations(pool);
    await pool.query('INSERT INTO assets (code, display_name, decimals) VALUES ($1, $2, 6)', [assetCode, assetCode]);
    await pool.query(`INSERT INTO accounts (id, owner_id, account_kind) VALUES ($1, $2, 'user_available')`, [sellerAccountId, sellerId]);
    await pool.query('INSERT INTO account_balances (account_id, asset_code, balance_atoms) VALUES ($1, $2, 1000000)', [sellerAccountId, assetCode]);
    const ads = new PostgresP2PAdRepository(pool);
    const orders = new PostgresP2POrderRepository(pool, { paymentTimeoutMs: 60_000 });
    const ad = await ads.create({ assetCode, fiatCurrency: 'TWD', maxAmountAtoms: '1000000', minAmountAtoms: '1000000', paymentMethodCode: 'bank_transfer', priceAtoms: '32000000', sellerId });
    const order = await orders.create({ adId: ad.id, amountAtoms: '1000000', buyerId, idempotencyKey: `p2p-timeout-${randomUUID()}`, requestHash: randomUUID() });
    assert.ok(Date.parse(order.paymentDeadlineAt) > Date.now());
    await pool.query(`UPDATE p2p_orders SET payment_deadline_at = now() - INTERVAL '1 second' WHERE id = $1`, [order.id]);
    assert.deepEqual(await orders.expireDue(), [order.id]);
    assert.deepEqual(await orders.expireDue(), []);
    assert.equal((await pool.query<{ status: string }>('SELECT status FROM p2p_orders WHERE id = $1', [order.id])).rows[0]?.status, 'cancelled');
    assert.equal((await pool.query<{ balance_atoms: string }>('SELECT balance_atoms::STRING FROM account_balances WHERE account_id = $1 AND asset_code = $2', [sellerAccountId, assetCode])).rows[0]?.balance_atoms, '1000000');
  } finally {
    await pool.end();
  }
});
