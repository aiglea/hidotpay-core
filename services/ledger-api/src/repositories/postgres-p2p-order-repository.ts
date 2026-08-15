import { randomUUID } from 'node:crypto';

import type { Pool, PoolClient } from 'pg';

import { DomainError } from '../domain/errors.js';
import { buildP2PEscrowLock, buildP2PEscrowRefund, buildP2PEscrowRelease, type LedgerTransaction } from '../domain/ledger.js';
import { validateP2PAd, validateP2POrderAmount } from '../domain/p2p-ad.js';
import { P2P_TIMEOUT_ACTOR, transitionP2POrder, type P2POrderAction, type P2POrderStatus } from '../domain/p2p.js';
import type { Account } from './ledger-repository.js';

export type P2POrderRecord = {
  adId: string;
  amountAtoms: string;
  assetCode: string;
  buyerId: string;
  escrowAccountId: string;
  fiatCurrency: string;
  id: string;
  paymentDeadlineAt: string;
  paymentMethodCode: string;
  priceAtoms: string;
  sellerAvailableAccountId: string;
  sellerId: string;
  status: P2POrderStatus;
};

export type CreateP2POrder = {
  adId: string;
  amountAtoms: string;
  buyerId: string;
  idempotencyKey: string;
  requestHash: string;
};

export type TransitionP2POrder = {
  action: P2POrderAction;
  actorId: string;
  idempotencyKey: string;
  orderId: string;
  reasonCode?: string;
  requestHash: string;
};

export type P2POrderRepositoryOptions = {
  paymentTimeoutMs: number;
};

type AdRow = {
  asset_code: string;
  fiat_currency: string;
  id: string;
  max_amount_atoms: string;
  min_amount_atoms: string;
  payment_method_code: string;
  price_atoms: string;
  seller_id: string;
  status: 'active' | 'closed' | 'paused';
};

type OrderRow = {
  ad_id: string;
  amount_atoms: string;
  asset_code: string;
  buyer_id: string;
  escrow_account_id: string;
  fiat_currency: string;
  id: string;
  payment_deadline_at: Date;
  payment_method_code: string;
  price_atoms: string;
  seller_available_account_id: string;
  seller_id: string;
  status: P2POrderStatus;
};

type AccountRow = {
  account_kind: Account['accountKind'];
  id: string;
  owner_id: string;
  status: Account['status'];
};

type StoredIdempotency = {
  request_hash: string;
  response_body: { order_id?: string };
};

function isRetryable(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  return code === '40001' || code === '23505';
}

function accountFromRow(row: AccountRow): Account {
  return { accountKind: row.account_kind, id: row.id, ownerId: row.owner_id, status: row.status };
}

function recordFromRow(row: OrderRow): P2POrderRecord {
  return {
    adId: row.ad_id,
    amountAtoms: row.amount_atoms,
    assetCode: row.asset_code,
    buyerId: row.buyer_id,
    escrowAccountId: row.escrow_account_id,
    fiatCurrency: row.fiat_currency,
    id: row.id,
    paymentDeadlineAt: row.payment_deadline_at.toISOString(),
    paymentMethodCode: row.payment_method_code,
    priceAtoms: row.price_atoms,
    sellerAvailableAccountId: row.seller_available_account_id,
    sellerId: row.seller_id,
    status: row.status,
  };
}

export class PostgresP2POrderRepository {
  private readonly paymentTimeoutMs: number;

  public constructor(private readonly pool: Pool, options: P2POrderRepositoryOptions = { paymentTimeoutMs: 15 * 60 * 1_000 }) {
    if (!Number.isInteger(options.paymentTimeoutMs) || options.paymentTimeoutMs < 60_000 || options.paymentTimeoutMs > 86_400_000) {
      throw new Error('P2P payment timeout must be between 60 seconds and 24 hours');
    }
    this.paymentTimeoutMs = options.paymentTimeoutMs;
  }

  public async create(input: CreateP2POrder): Promise<P2POrderRecord> {
    return this.runTransaction(async (client) => {
      const scope = `p2p_order:${input.buyerId}`;
      const stored = await this.idempotencyForUpdate(client, scope, input.idempotencyKey);
      if (stored) {
        if (stored.request_hash !== input.requestHash) throw new DomainError('idempotency_conflict');
        if (!stored.response_body.order_id) throw new Error('idempotency record missing P2P order id');
        return this.orderForUpdate(client, stored.response_body.order_id);
      }

      const adResult = await client.query<AdRow>(
        `SELECT id, seller_id, asset_code, fiat_currency, price_atoms::STRING, min_amount_atoms::STRING,
                max_amount_atoms::STRING, payment_method_code, status
           FROM p2p_ads WHERE id = $1 FOR UPDATE`,
        [input.adId],
      );
      const ad = adResult.rows[0];
      if (!ad || ad.status !== 'active') throw new DomainError('p2p_ad_unavailable');
      const validatedAd = validateP2PAd({
        assetCode: ad.asset_code,
        fiatCurrency: ad.fiat_currency,
        maxAmountAtoms: ad.max_amount_atoms,
        minAmountAtoms: ad.min_amount_atoms,
        paymentMethodCode: ad.payment_method_code,
        priceAtoms: ad.price_atoms,
        sellerId: ad.seller_id,
      });
      const amountAtoms = validateP2POrderAmount(validatedAd, input.amountAtoms);
      if (input.buyerId === validatedAd.sellerId) throw new DomainError('p2p_self_dealing_forbidden');

      const seller = await this.userAvailableAccountForUpdate(client, validatedAd.sellerId, false);
      if (seller.status !== 'active') throw new DomainError('account_unavailable');
      const buyer = await this.userAvailableAccountForUpdate(client, input.buyerId, true);
      if (buyer.status !== 'active') throw new DomainError('account_unavailable');
      const orderId = randomUUID();
      const escrowAccountId = randomUUID();
      const paymentDeadlineAt = new Date(Date.now() + this.paymentTimeoutMs);
      await client.query(
        `INSERT INTO accounts (id, owner_id, account_kind)
         VALUES ($1, $2, 'p2p_escrow')`,
        [escrowAccountId, `p2p:${orderId}`],
      );
      await this.ensureBalanceRows(client, [seller.id, escrowAccountId], validatedAd.assetCode);
      const sellerBalance = await this.balanceForUpdate(client, seller.id, validatedAd.assetCode);
      if (sellerBalance < BigInt(amountAtoms)) throw new DomainError('insufficient_funds');
      const ledgerTransaction = buildP2PEscrowLock({
        amountAtoms,
        assetCode: validatedAd.assetCode,
        fromAccountId: seller.id,
        toAccountId: escrowAccountId,
      });
      await this.insertLedgerTransaction(client, ledgerTransaction, scope, input.idempotencyKey, input.requestHash, input.buyerId, { ad_id: input.adId, order_id: orderId });
      await this.applyPostings(client, ledgerTransaction);
      await client.query(
        `INSERT INTO p2p_orders
         (id, ad_id, buyer_id, seller_id, seller_available_account_id, escrow_account_id, asset_code, amount_atoms, fiat_currency, price_atoms, payment_method_code, status, payment_deadline_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::DECIMAL, $9, $10::DECIMAL, $11, 'awaiting_payment', $12)`,
        [orderId, input.adId, input.buyerId, validatedAd.sellerId, seller.id, escrowAccountId, validatedAd.assetCode, amountAtoms, validatedAd.fiatCurrency, validatedAd.priceAtoms, validatedAd.paymentMethodCode, paymentDeadlineAt],
      );
      const response = { order_id: orderId, status: 'awaiting_payment' };
      await this.insertIdempotency(client, scope, input.idempotencyKey, input.requestHash, 201, response);
      await this.insertOutbox(client, 'p2p.order.created', 'p2p_order', orderId, { ledger_transaction_id: ledgerTransaction.id, payment_deadline_at: paymentDeadlineAt.toISOString(), ...response });
      return this.orderForUpdate(client, orderId);
    });
  }

  public async listForActor(actorId: string): Promise<P2POrderRecord[]> {
    const result = await this.pool.query<OrderRow>(
      `SELECT id, ad_id, buyer_id, seller_id, seller_available_account_id, escrow_account_id, asset_code,
              amount_atoms::STRING, fiat_currency, price_atoms::STRING, payment_method_code, payment_deadline_at, status
         FROM p2p_orders WHERE buyer_id = $1 OR seller_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [actorId],
    );
    return result.rows.map(recordFromRow);
  }

  public async transition(input: TransitionP2POrder): Promise<P2POrderRecord> {
    return this.runTransaction(async (client) => {
      const scope = `p2p_order_action:${input.orderId}:${input.actorId}`;
      const stored = await this.idempotencyForUpdate(client, scope, input.idempotencyKey);
      if (stored) {
        if (stored.request_hash !== input.requestHash) throw new DomainError('idempotency_conflict');
        if (!stored.response_body.order_id) throw new Error('idempotency record missing P2P order id');
        return this.orderForUpdate(client, stored.response_body.order_id);
      }
      const order = await this.orderForUpdate(client, input.orderId);
      if (input.action === 'system_timeout_refund' && Date.parse(order.paymentDeadlineAt) > Date.now()) {
        throw new DomainError('p2p_payment_deadline_not_reached');
      }
      const next = transitionP2POrder(order, input.action, input.actorId);
      let ledgerTransaction: LedgerTransaction | undefined;
      if (input.action === 'seller_release' || input.action === 'arbitrator_release_buyer') {
        const buyer = await this.userAvailableAccountForUpdate(client, order.buyerId, true);
        if (buyer.status !== 'active') throw new DomainError('account_unavailable');
        await this.ensureBalanceRows(client, [order.escrowAccountId, buyer.id], order.assetCode);
        ledgerTransaction = buildP2PEscrowRelease({ amountAtoms: order.amountAtoms, assetCode: order.assetCode, fromAccountId: order.escrowAccountId, toAccountId: buyer.id });
      }
      if (input.action === 'seller_cancel' || input.action === 'arbitrator_refund_seller' || input.action === 'system_timeout_refund') {
        await this.ensureBalanceRows(client, [order.escrowAccountId, order.sellerAvailableAccountId], order.assetCode);
        ledgerTransaction = buildP2PEscrowRefund({ amountAtoms: order.amountAtoms, assetCode: order.assetCode, fromAccountId: order.escrowAccountId, toAccountId: order.sellerAvailableAccountId });
      }
      if (ledgerTransaction) {
        await this.insertLedgerTransaction(client, ledgerTransaction, scope, input.idempotencyKey, input.requestHash, input.actorId, { action: input.action, order_id: order.id });
        await this.applyPostings(client, ledgerTransaction);
      }
      if (input.action === 'open_dispute') {
        if (!input.reasonCode || !/^[a-z][a-z0-9_:-]{2,63}$/.test(input.reasonCode)) throw new DomainError('invalid_p2p_dispute_reason');
        await client.query(
          `INSERT INTO p2p_disputes (id, order_id, opened_by, reason_code, status)
           VALUES ($1, $2, $3, $4, 'open')`,
          [randomUUID(), order.id, input.actorId, input.reasonCode],
        );
      }
      if (input.action === 'arbitrator_release_buyer' || input.action === 'arbitrator_refund_seller') {
        await client.query(
          `UPDATE p2p_disputes
              SET status = $2, resolved_by = $3, resolved_at = now()
            WHERE order_id = $1 AND status = 'open'`,
          [order.id, input.action === 'arbitrator_release_buyer' ? 'resolved_buyer' : 'resolved_seller', input.actorId],
        );
      }
      await client.query(
        `UPDATE p2p_orders
            SET status = $2, dispute_opened_by = CASE WHEN $3 = 'open_dispute' THEN $4 ELSE dispute_opened_by END,
                released_by = CASE WHEN $3 IN ('seller_release', 'arbitrator_release_buyer') THEN $4 ELSE released_by END,
                cancelled_by = CASE WHEN $3 IN ('seller_cancel', 'arbitrator_refund_seller', 'system_timeout_refund') THEN $4 ELSE cancelled_by END,
                updated_at = now()
          WHERE id = $1`,
        [order.id, next.status, input.action, input.actorId],
      );
      const response = { order_id: order.id, status: next.status };
      await this.insertIdempotency(client, scope, input.idempotencyKey, input.requestHash, 200, response);
      await this.insertOutbox(client, `p2p.order.${next.status}`, 'p2p_order', order.id, { action: input.action, ledger_transaction_id: ledgerTransaction?.id, ...response });
      return this.orderForUpdate(client, order.id);
    });
  }

  public async expireDue(limit = 100): Promise<string[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) throw new Error('P2P expiry limit must be between 1 and 1000');
    const candidates = await this.pool.query<{ id: string }>(
      `SELECT id FROM p2p_orders
        WHERE status = 'awaiting_payment' AND payment_deadline_at <= now()
        ORDER BY payment_deadline_at ASC LIMIT $1`,
      [limit],
    );
    const expired: string[] = [];
    for (const candidate of candidates.rows) {
      try {
        const result = await this.transition({
          action: 'system_timeout_refund',
          actorId: P2P_TIMEOUT_ACTOR,
          idempotencyKey: 'automatic-payment-timeout-refund',
          orderId: candidate.id,
          requestHash: candidate.id,
        });
        if (result.status === 'cancelled') expired.push(candidate.id);
      } catch (error) {
        if (!(error instanceof DomainError) || (error.code !== 'invalid_p2p_order_transition' && error.code !== 'p2p_payment_deadline_not_reached')) throw error;
      }
    }
    return expired;
  }

  private async runTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
        const result = await operation(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        if (attempt < 3 && isRetryable(error)) continue;
        throw error;
      } finally {
        client.release();
      }
    }
    throw new Error('serializable retry limit exhausted');
  }

  private async idempotencyForUpdate(client: PoolClient, scope: string, key: string): Promise<StoredIdempotency | undefined> {
    const result = await client.query<StoredIdempotency>(
      'SELECT request_hash, response_body FROM idempotency_records WHERE scope = $1 AND idempotency_key = $2 FOR UPDATE',
      [scope, key],
    );
    return result.rows[0];
  }

  private async orderForUpdate(client: PoolClient, orderId: string): Promise<P2POrderRecord> {
    const result = await client.query<OrderRow>(
      `SELECT id, ad_id, buyer_id, seller_id, seller_available_account_id, escrow_account_id, asset_code,
              amount_atoms::STRING, fiat_currency, price_atoms::STRING, payment_method_code, payment_deadline_at, status
         FROM p2p_orders WHERE id = $1 FOR UPDATE`,
      [orderId],
    );
    const row = result.rows[0];
    if (!row) throw new DomainError('p2p_order_not_found');
    return recordFromRow(row);
  }

  private async userAvailableAccountForUpdate(client: PoolClient, ownerId: string, create: boolean): Promise<Account> {
    if (create) {
      await client.query(
        `INSERT INTO accounts (id, owner_id, account_kind)
         VALUES ($1, $2, 'user_available') ON CONFLICT (owner_id, account_kind) DO NOTHING`,
        [randomUUID(), ownerId],
      );
    }
    const result = await client.query<AccountRow>(
      `SELECT id, owner_id, account_kind, status FROM accounts
        WHERE owner_id = $1 AND account_kind = 'user_available' FOR UPDATE`,
      [ownerId],
    );
    const row = result.rows[0];
    if (!row) throw new DomainError('account_not_found');
    return accountFromRow(row);
  }

  private async ensureBalanceRows(client: PoolClient, accountIds: string[], assetCode: string): Promise<void> {
    for (const accountId of accountIds) {
      await client.query(
        `INSERT INTO account_balances (account_id, asset_code, balance_atoms)
         VALUES ($1, $2, 0) ON CONFLICT (account_id, asset_code) DO NOTHING`,
        [accountId, assetCode],
      );
    }
  }

  private async balanceForUpdate(client: PoolClient, accountId: string, assetCode: string): Promise<bigint> {
    const result = await client.query<{ balance_atoms: string }>(
      'SELECT balance_atoms::STRING FROM account_balances WHERE account_id = $1 AND asset_code = $2 FOR UPDATE',
      [accountId, assetCode],
    );
    return BigInt(result.rows[0]?.balance_atoms ?? '0');
  }

  private async insertLedgerTransaction(
    client: PoolClient,
    transaction: LedgerTransaction,
    scope: string,
    key: string,
    requestHash: string,
    actorId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO ledger_transactions
       (id, transaction_type, idempotency_scope, idempotency_key, request_hash, actor_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::JSONB)`,
      [transaction.id, transaction.transactionType, scope, key, requestHash, actorId, JSON.stringify(metadata)],
    );
    const values: string[] = [];
    const parameters: unknown[] = [];
    transaction.postings.forEach((posting, index) => {
      const offset = index * 5;
      values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}::DECIMAL)`);
      parameters.push(posting.id, transaction.id, posting.accountId, posting.assetCode, posting.amountAtoms.toString());
    });
    await client.query(`INSERT INTO ledger_postings (id, transaction_id, account_id, asset_code, amount_atoms) VALUES ${values.join(', ')}`, parameters);
  }

  private async applyPostings(client: PoolClient, transaction: LedgerTransaction): Promise<void> {
    for (const posting of transaction.postings) {
      const result = await client.query(
        `UPDATE account_balances AS balances SET balance_atoms = balances.balance_atoms + $3::DECIMAL, updated_at = now()
           FROM accounts WHERE balances.account_id = $1 AND balances.asset_code = $2 AND accounts.id = balances.account_id
             AND (accounts.account_kind = 'platform_settlement' OR balances.balance_atoms + $3::DECIMAL >= 0)`,
        [posting.accountId, posting.assetCode, posting.amountAtoms.toString()],
      );
      if (result.rowCount !== 1) throw new DomainError('insufficient_funds');
    }
  }

  private async insertIdempotency(client: PoolClient, scope: string, key: string, hash: string, status: number, response: Record<string, unknown>): Promise<void> {
    await client.query(
      `INSERT INTO idempotency_records (scope, idempotency_key, request_hash, response_status, response_body)
       VALUES ($1, $2, $3, $4, $5::JSONB)`,
      [scope, key, hash, status, JSON.stringify(response)],
    );
  }

  private async insertOutbox(client: PoolClient, eventType: string, aggregateType: string, aggregateId: string, payload: Record<string, unknown>): Promise<void> {
    await client.query(
      `INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload)
       VALUES ($1, $2, $3, $4, $5::JSONB)`,
      [randomUUID(), eventType, aggregateType, aggregateId, JSON.stringify(payload)],
    );
  }
}
