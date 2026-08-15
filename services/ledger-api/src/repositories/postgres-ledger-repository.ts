import { randomUUID } from 'node:crypto';

import type { Pool, PoolClient } from 'pg';

import { DomainError } from '../domain/errors.js';
import { buildInternalTransfer, buildTransaction, type LedgerTransaction } from '../domain/ledger.js';
import { parseNonNegativeAtoms, parsePositiveAtoms } from '../domain/money.js';
import { RiskService } from '../services/risk-service.js';
import type {
  Account,
  ConfirmedDeposit,
  CreateWithdrawalFeeQuote,
  DepositResult,
  IdempotentTransfer,
  LedgerRepository,
  TransferResult,
  WithdrawalFeeQuote,
  Withdrawal,
  WithdrawalRequest,
  WithdrawalResult,
  UserWallet,
} from './ledger-repository.js';

type BalanceRow = {
  account_id: string;
  account_kind: string;
  asset_code: string;
  balance_atoms: string;
  owner_id: string;
  status: string;
};

type IdempotencyRow = {
  request_hash: string;
  response_body: { transfer_id?: string; withdrawal_id?: string };
};

type WithdrawalRow = {
  account_id: string;
  amount_atoms: string;
  asset_code: string;
  chain_transaction_hash: string | null;
  destination_address: string;
  fee_atoms: string;
  frozen_account_id: string;
  id: string;
  network: string;
  requested_by: string;
  status: Withdrawal['status'];
};

type WithdrawalFeeQuoteRow = {
  amount_atoms: string;
  asset_code: string;
  consumed_at: Date | null;
  expires_at: Date;
  fee_atoms: string;
  network: string;
  user_id: string;
};

type WithdrawalWhitelistRow = {
  added_at: Date;
  status: 'active' | 'blocked' | 'pending_cooldown';
};

function isRetryable(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  return code === '40001' || code === '23505';
}

export class PostgresLedgerRepository implements LedgerRepository {
  public constructor(private readonly pool: Pool) {}

  public async ensureUserWallet(ownerId: string): Promise<UserWallet> {
    return this.runTransaction(async (client) => {
      const availableAccount = await this.findOrCreateUserAccount(client, ownerId, 'user_available');
      const frozenAccount = await this.findOrCreateUserAccount(client, ownerId, 'user_frozen');
      return { availableAccount, frozenAccount };
    });
  }

  public async getBalances(accountId: string): Promise<Array<{ assetCode: string; balanceAtoms: string }>> {
    const exists = await this.pool.query('SELECT 1 FROM accounts WHERE id = $1', [accountId]);
    if (exists.rowCount !== 1) throw new DomainError('account_not_found');
    const result = await this.pool.query<{ asset_code: string; balance_atoms: string }>(
      'SELECT asset_code, balance_atoms::STRING FROM account_balances WHERE account_id = $1 ORDER BY asset_code',
      [accountId],
    );
    return result.rows.map((row) => ({ assetCode: row.asset_code, balanceAtoms: row.balance_atoms }));
  }

  public async getAccount(accountId: string): Promise<Account> {
    const result = await this.pool.query<{
      account_kind: Account['accountKind'];
      id: string;
      owner_id: string;
      status: Account['status'];
    }>(
      'SELECT id, owner_id, account_kind, status FROM accounts WHERE id = $1',
      [accountId],
    );
    const account = result.rows[0];
    if (!account) throw new DomainError('account_not_found');
    return {
      accountKind: account.account_kind,
      id: account.id,
      ownerId: account.owner_id,
      status: account.status,
    };
  }

  public async createWithdrawalFeeQuote(input: CreateWithdrawalFeeQuote): Promise<WithdrawalFeeQuote> {
    const amountAtoms = parsePositiveAtoms(input.amountAtoms);
    const feeAtoms = parseNonNegativeAtoms(input.feeAtoms);
    const expiresAt = new Date(input.expiresAt);
    if (Number.isNaN(expiresAt.valueOf()) || expiresAt <= new Date()) throw new DomainError('invalid_fee_quote');
    const id = randomUUID();
    const client = await this.pool.connect();
    try {
      await this.requireAsset(client, input.assetCode);
      await this.requireEnabledChainAsset(client, input.network, input.assetCode);
      await client.query(
        `INSERT INTO withdrawal_fee_quotes (id, user_id, network, asset_code, amount_atoms, fee_atoms, expires_at)
         VALUES ($1, $2, $3, $4, $5::DECIMAL, $6::DECIMAL, $7)`,
        [id, input.userId, input.network, input.assetCode, amountAtoms.toString(), feeAtoms.toString(), expiresAt.toISOString()],
      );
      return { expiresAt: expiresAt.toISOString(), feeAtoms: feeAtoms.toString(), id };
    } finally {
      client.release();
    }
  }

  public async confirmDeposit(input: ConfirmedDeposit): Promise<DepositResult> {
    return this.runTransaction(async (client) => {
      const existing = await client.query<{ id: string; credited_transaction_id: string }>(
        `SELECT id, credited_transaction_id FROM deposit_receipts
         WHERE network = $1 AND transaction_hash = $2 AND output_index = $3 FOR UPDATE`,
        [input.network, input.transactionHash, input.outputIndex],
      );
      const receipt = existing.rows[0];
      if (receipt?.credited_transaction_id) return { created: false, depositId: receipt.id, transferId: receipt.credited_transaction_id };
      if (!Number.isInteger(input.confirmationCount) || input.confirmationCount <= 0 || !Number.isInteger(input.outputIndex) || input.outputIndex < 0) {
        throw new DomainError('invalid_deposit');
      }
      const amountAtoms = parsePositiveAtoms(input.amountAtoms);
      await this.requireAsset(client, input.assetCode);
      await this.requireChainAsset(client, input.network, input.assetCode, input.confirmationCount, input.contractIdentifier);
      const destination = await this.getAccountForUpdate(client, input.destinationAccountId);
      const settlement = await this.getPlatformAccountForUpdate(client, 'platform:settlement', 'platform_settlement');
      if (destination.accountKind !== 'user_available' || destination.status !== 'active' || settlement.status !== 'active') throw new DomainError('account_unavailable');
      await this.ensureBalanceRows(client, [destination.id, settlement.id], input.assetCode);
      const transaction = buildTransaction('deposit_credit', [
        { accountId: settlement.id, amountAtoms: (-amountAtoms).toString(), assetCode: input.assetCode },
        { accountId: destination.id, amountAtoms: amountAtoms.toString(), assetCode: input.assetCode },
      ]);
      const depositId = randomUUID();
      await this.insertLedgerTransaction(client, transaction, `deposit:${input.network}:${input.transactionHash}`, String(input.outputIndex), `${input.network}:${input.transactionHash}:${input.outputIndex}`, input.actorId, {
        confirmation_count: input.confirmationCount, deposit_id: depositId,
      });
      await this.applyPostings(client, transaction);
      await client.query(
        `INSERT INTO deposit_receipts (id, network, transaction_hash, output_index, asset_code, destination_account_id, amount_atoms, confirmation_count, credited_transaction_id, contract_identifier, block_height, block_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7::DECIMAL, $8, $9, $10, $11, $12)`,
        [depositId, input.network, input.transactionHash, input.outputIndex, input.assetCode, destination.id, amountAtoms.toString(), input.confirmationCount, transaction.id, input.contractIdentifier, input.blockHeight, input.blockHash],
      );
      await this.insertOutbox(client, 'deposit.credited', 'deposit_receipt', depositId, { deposit_id: depositId, ledger_transaction_id: transaction.id });
      return { created: true, depositId, transferId: transaction.id };
    });
  }

  public async requestWithdrawal(input: WithdrawalRequest): Promise<WithdrawalResult> {
    return this.runTransaction(async (client) => {
      const scope = `withdrawal:${input.actorId}`;
      const stored = await client.query<IdempotencyRow>(
        'SELECT request_hash, response_body FROM idempotency_records WHERE scope = $1 AND idempotency_key = $2 FOR UPDATE',
        [scope, input.idempotencyKey],
      );
      const existing = stored.rows[0];
      if (existing) {
        if (existing.request_hash !== input.requestHash) throw new DomainError('idempotency_conflict');
        const withdrawalId = existing.response_body.withdrawal_id;
        if (!withdrawalId) throw new Error('idempotency record missing withdrawal id');
        return { created: false, withdrawalId };
      }
      const amountAtoms = parsePositiveAtoms(input.amountAtoms);
      const quoteResult = await client.query<WithdrawalFeeQuoteRow>(
        `SELECT user_id, network, asset_code, amount_atoms::STRING, fee_atoms::STRING, expires_at, consumed_at
         FROM withdrawal_fee_quotes WHERE id = $1 FOR UPDATE`,
        [input.feeQuoteId],
      );
      const quote = quoteResult.rows[0];
      if (!quote || quote.consumed_at || quote.user_id !== input.actorId || quote.network !== input.network || quote.asset_code !== input.assetCode || quote.amount_atoms !== input.amountAtoms) {
        throw new DomainError('fee_quote_invalid');
      }
      if (quote.expires_at <= new Date()) throw new DomainError('fee_quote_expired');
      const feeAtoms = parseNonNegativeAtoms(quote.fee_atoms);
      const totalAtoms = amountAtoms + feeAtoms;
      await this.requireAsset(client, input.assetCode);
      await this.requireEnabledChainAsset(client, input.network, input.assetCode);
      const source = await this.getAccountForUpdate(client, input.fromAccountId);
      const frozen = await this.getAccountForUpdate(client, input.frozenAccountId);
      if (source.ownerId !== input.actorId) throw new DomainError('account_not_owned');
      if (source.accountKind !== 'user_available' || frozen.accountKind !== 'user_frozen' || frozen.ownerId !== source.ownerId || source.status !== 'active' || frozen.status !== 'active') {
        throw new DomainError('account_unavailable');
      }
      const whitelistResult = await client.query<WithdrawalWhitelistRow>(
        `SELECT added_at, status FROM withdrawal_address_whitelist
         WHERE user_id = $1 AND network = $2 AND address = $3 FOR UPDATE`,
        [input.actorId, input.network, input.destinationAddress],
      );
      const whitelist = whitelistResult.rows[0];
      if (!whitelist) throw new DomainError('withdrawal_whitelist_missing');
      if (whitelist.status === 'blocked') throw new DomainError('destination_address_blocked');
      if (whitelist.status !== 'active') throw new DomainError('withdrawal_whitelist_cooling_down');
      const usage = await client.query<{ used_atoms: string }>(
        `SELECT COALESCE(sum(amount_atoms), 0)::STRING AS used_atoms
         FROM withdrawal_requests
         WHERE requested_by = $1 AND asset_code = $2 AND created_at >= date_trunc('day', now())
           AND status IN ('pending_review', 'approved', 'broadcast', 'confirmed')`,
        [input.actorId, input.assetCode],
      );
      const now = new Date();
      new RiskService({
        dailyLimitAtoms: input.riskControls.dailyLimitAtoms,
        maxPerWithdrawalAtoms: input.riskControls.maxPerWithdrawalAtoms,
        now: () => now,
        whitelistCooldownMs: input.riskControls.whitelistCooldownMs,
      }).assessWithdrawal({
        amountAtoms: input.amountAtoms,
        destinationAddress: input.destinationAddress,
        feeQuote: { expiresAt: quote.expires_at.toISOString(), feeAtoms: quote.fee_atoms, id: input.feeQuoteId },
        usedTodayAtoms: usage.rows[0]?.used_atoms ?? '0',
        userId: input.actorId,
        whitelistAddedAt: whitelist.added_at.toISOString(),
      });
      await this.ensureBalanceRows(client, [source.id, frozen.id], input.assetCode);
      const sourceBalance = await client.query<{ balance_atoms: string }>(
        'SELECT balance_atoms::STRING FROM account_balances WHERE account_id = $1 AND asset_code = $2 FOR UPDATE', [source.id, input.assetCode],
      );
      if (BigInt(sourceBalance.rows[0]?.balance_atoms ?? '0') < totalAtoms) throw new DomainError('insufficient_funds');
      const transaction = buildTransaction('withdrawal_freeze', [
        { accountId: source.id, amountAtoms: (-totalAtoms).toString(), assetCode: input.assetCode },
        { accountId: frozen.id, amountAtoms: totalAtoms.toString(), assetCode: input.assetCode },
      ]);
      const withdrawalId = randomUUID();
      await this.insertLedgerTransaction(client, transaction, scope, input.idempotencyKey, input.requestHash, input.actorId, { fee_quote_id: input.feeQuoteId, withdrawal_id: withdrawalId });
      await this.applyPostings(client, transaction);
      await client.query(
        `INSERT INTO withdrawal_requests (id, account_id, frozen_account_id, asset_code, amount_atoms, fee_atoms, network, destination_address, status, requested_by)
         VALUES ($1, $2, $3, $4, $5::DECIMAL, $6::DECIMAL, $7, $8, 'pending_review', $9)`,
        [withdrawalId, source.id, frozen.id, input.assetCode, amountAtoms.toString(), feeAtoms.toString(), input.network, input.destinationAddress, input.actorId],
      );
      await client.query('UPDATE withdrawal_fee_quotes SET consumed_at = now() WHERE id = $1', [input.feeQuoteId]);
      await client.query(
        `INSERT INTO withdrawal_risk_decisions (id, withdrawal_id, decision, rule_code, details)
         VALUES ($1, $2, 'allow', 'all_rules_passed', $3::JSONB)`,
        [randomUUID(), withdrawalId, JSON.stringify({ fee_quote_id: input.feeQuoteId, used_today_atoms: usage.rows[0]?.used_atoms ?? '0' })],
      );
      const response = { status: 'pending_review', withdrawal_id: withdrawalId };
      await client.query(
        `INSERT INTO idempotency_records (scope, idempotency_key, request_hash, response_status, response_body)
         VALUES ($1, $2, $3, 201, $4::JSONB)`, [scope, input.idempotencyKey, input.requestHash, JSON.stringify(response)],
      );
      await this.insertOutbox(client, 'withdrawal.requested', 'withdrawal_request', withdrawalId, response);
      return { created: true, withdrawalId };
    });
  }

  public async approveWithdrawal(withdrawalId: string, reviewerId: string): Promise<Withdrawal> {
    return this.runTransaction(async (client) => {
      const withdrawal = await this.getWithdrawalForUpdate(client, withdrawalId);
      if (withdrawal.status !== 'pending_review') throw new DomainError('invalid_withdrawal_state');
      if (withdrawal.requestedBy === reviewerId) throw new DomainError('self_approval_forbidden');
      await client.query(`UPDATE withdrawal_requests SET status = 'approved', reviewed_by = $2, updated_at = now() WHERE id = $1`, [withdrawalId, reviewerId]);
      await this.insertOutbox(client, 'withdrawal.approved', 'withdrawal_request', withdrawalId, { withdrawal_id: withdrawalId, reviewer_id: reviewerId });
      return { ...withdrawal, status: 'approved' };
    });
  }

  public async settleWithdrawal(withdrawalId: string, chainTransactionHash: string): Promise<Withdrawal> {
    return this.runTransaction(async (client) => {
      const withdrawal = await this.getWithdrawalForUpdate(client, withdrawalId);
      if (withdrawal.status === 'confirmed' && withdrawal.chainTransactionHash === chainTransactionHash) return withdrawal;
      if (withdrawal.status !== 'broadcast') throw new DomainError('invalid_withdrawal_state');
      if (!/^[A-Za-z0-9:_-]{8,256}$/.test(chainTransactionHash)) throw new DomainError('invalid_chain_transaction');
      if (withdrawal.chainTransactionHash !== chainTransactionHash) throw new DomainError('invalid_chain_transaction');
      const settlement = await this.getPlatformAccountForUpdate(client, 'platform:settlement', 'platform_settlement');
      const treasury = await this.getPlatformAccountForUpdate(client, 'platform:treasury', 'platform_treasury');
      await this.ensureBalanceRows(client, [withdrawal.frozenAccountId, settlement.id, treasury.id], withdrawal.assetCode);
      const amountAtoms = BigInt(withdrawal.amountAtoms);
      const feeAtoms = BigInt(withdrawal.feeAtoms);
      if (await this.balanceOfForUpdate(client, withdrawal.frozenAccountId, withdrawal.assetCode) < amountAtoms + feeAtoms) {
        throw new DomainError('insufficient_funds');
      }
      const transaction = buildTransaction('withdrawal_settle', [
        { accountId: withdrawal.frozenAccountId, amountAtoms: (-(amountAtoms + feeAtoms)).toString(), assetCode: withdrawal.assetCode },
        { accountId: settlement.id, amountAtoms: amountAtoms.toString(), assetCode: withdrawal.assetCode },
        { accountId: treasury.id, amountAtoms: feeAtoms.toString(), assetCode: withdrawal.assetCode },
      ].filter((posting) => posting.amountAtoms !== '0'));
      await this.insertLedgerTransaction(client, transaction, `withdrawal_settle:${withdrawalId}`, chainTransactionHash, chainTransactionHash, 'chain_worker', { withdrawal_id: withdrawalId });
      await this.applyPostings(client, transaction);
      await client.query(
        `UPDATE withdrawal_requests SET status = 'confirmed', chain_transaction_hash = $2, updated_at = now() WHERE id = $1`, [withdrawalId, chainTransactionHash],
      );
      await this.insertOutbox(client, 'withdrawal.confirmed', 'withdrawal_request', withdrawalId, { withdrawal_id: withdrawalId, chain_transaction_hash: chainTransactionHash });
      return { ...withdrawal, status: 'confirmed' };
    });
  }

  public async markWithdrawalBroadcast(withdrawalId: string, chainTransactionHash: string): Promise<Withdrawal> {
    return this.runTransaction(async (client) => {
      const withdrawal = await this.getWithdrawalForUpdate(client, withdrawalId);
      if (!/^[A-Za-z0-9:_-]{8,256}$/.test(chainTransactionHash)) throw new DomainError('invalid_chain_transaction');
      if (withdrawal.status === 'broadcast') {
        if (withdrawal.chainTransactionHash !== chainTransactionHash) throw new DomainError('invalid_chain_transaction');
        return withdrawal;
      }
      if (withdrawal.status !== 'approved') throw new DomainError('invalid_withdrawal_state');
      await client.query(
        `UPDATE withdrawal_requests SET status = 'broadcast', chain_transaction_hash = $2, updated_at = now() WHERE id = $1`,
        [withdrawalId, chainTransactionHash],
      );
      await this.insertOutbox(client, 'withdrawal.broadcast', 'withdrawal_request', withdrawalId, { withdrawal_id: withdrawalId, chain_transaction_hash: chainTransactionHash });
      return { ...withdrawal, chainTransactionHash, status: 'broadcast' };
    });
  }

  public async failWithdrawal(withdrawalId: string, reason: string): Promise<Withdrawal> {
    return this.runTransaction(async (client) => {
      const withdrawal = await this.getWithdrawalForUpdate(client, withdrawalId);
      if (withdrawal.status !== 'pending_review' && withdrawal.status !== 'approved') throw new DomainError('invalid_withdrawal_state');
      if (reason.trim().length === 0 || reason.length > 512) throw new DomainError('invalid_withdrawal_failure');
      await this.ensureBalanceRows(client, [withdrawal.accountId, withdrawal.frozenAccountId], withdrawal.assetCode);
      const totalAtoms = BigInt(withdrawal.amountAtoms) + BigInt(withdrawal.feeAtoms);
      if (await this.balanceOfForUpdate(client, withdrawal.frozenAccountId, withdrawal.assetCode) < totalAtoms) {
        throw new DomainError('insufficient_funds');
      }
      const transaction = buildTransaction('withdrawal_release', [
        { accountId: withdrawal.frozenAccountId, amountAtoms: (-totalAtoms).toString(), assetCode: withdrawal.assetCode },
        { accountId: withdrawal.accountId, amountAtoms: totalAtoms.toString(), assetCode: withdrawal.assetCode },
      ]);
      await this.insertLedgerTransaction(client, transaction, `withdrawal_release:${withdrawalId}`, withdrawalId, withdrawalId, 'chain_worker', { reason, withdrawal_id: withdrawalId });
      await this.applyPostings(client, transaction);
      await client.query(`UPDATE withdrawal_requests SET status = 'failed', failure_reason = $2, updated_at = now() WHERE id = $1`, [withdrawalId, reason]);
      await this.insertOutbox(client, 'withdrawal.failed', 'withdrawal_request', withdrawalId, { reason, withdrawal_id: withdrawalId });
      return { ...withdrawal, status: 'failed' };
    });
  }

  public async transferInternal(input: IdempotentTransfer): Promise<TransferResult> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
        const result = await this.transferInTransaction(client, input);
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

  private async transferInTransaction(client: PoolClient, input: IdempotentTransfer): Promise<TransferResult> {
    const scope = `internal_transfer:${input.actorId}`;
    const stored = await client.query<IdempotencyRow>(
      'SELECT request_hash, response_body FROM idempotency_records WHERE scope = $1 AND idempotency_key = $2 FOR UPDATE',
      [scope, input.idempotencyKey],
    );
    const existing = stored.rows[0];
    if (existing) {
      if (existing.request_hash !== input.requestHash) throw new DomainError('idempotency_conflict');
      const transferId = existing.response_body.transfer_id;
      if (!transferId) throw new Error('idempotency record missing transfer id');
      return { created: false, transferId };
    }

    const amountAtoms = parsePositiveAtoms(input.amountAtoms);
    await this.requireAsset(client, input.assetCode);
    const accounts = await client.query<BalanceRow>(
      `SELECT balances.account_id, balances.asset_code, balances.balance_atoms::STRING, accounts.owner_id, accounts.account_kind, accounts.status
       FROM account_balances AS balances
       JOIN accounts ON accounts.id = balances.account_id
       WHERE balances.asset_code = $1 AND balances.account_id IN ($2, $3)
       ORDER BY balances.account_id FOR UPDATE`,
      [input.assetCode, input.fromAccountId, input.toAccountId],
    );
    if (accounts.rowCount !== 2) throw new DomainError('account_not_found');
    const source = accounts.rows.find((row) => row.account_id === input.fromAccountId);
    const destination = accounts.rows.find((row) => row.account_id === input.toAccountId);
    if (!source || !destination) throw new DomainError('account_not_found');
    if (source.owner_id !== input.actorId) throw new DomainError('account_not_owned');
    if (source.account_kind !== 'user_available' || destination.account_kind !== 'user_available' || source.status !== 'active' || destination.status !== 'active') {
      throw new DomainError('account_unavailable');
    }
    if (BigInt(source.balance_atoms) < amountAtoms) throw new DomainError('insufficient_funds');

    const transaction = buildInternalTransfer(input);
    await client.query(
      `INSERT INTO ledger_transactions
       (id, transaction_type, idempotency_scope, idempotency_key, request_hash, actor_id, metadata)
       VALUES ($1, 'internal_transfer', $2, $3, $4, $5, $6::JSONB)`,
      [transaction.id, scope, input.idempotencyKey, input.requestHash, input.actorId, JSON.stringify({})],
    );
    await client.query(
      `INSERT INTO ledger_postings (id, transaction_id, account_id, asset_code, amount_atoms)
       VALUES ($1, $2, $3, $4, $5), ($6, $2, $7, $4, $8)`,
      [
        transaction.postings[0]?.id,
        transaction.id,
        input.fromAccountId,
        input.assetCode,
        transaction.postings[0]?.amountAtoms.toString(),
        transaction.postings[1]?.id,
        input.toAccountId,
        transaction.postings[1]?.amountAtoms.toString(),
      ],
    );
    await client.query(
      `UPDATE account_balances
       SET balance_atoms = balance_atoms + CASE
         WHEN account_id = $1 THEN -$3::DECIMAL
         WHEN account_id = $2 THEN $3::DECIMAL
         ELSE 0
       END,
       updated_at = now()
       WHERE account_id IN ($1, $2) AND asset_code = $4`,
      [input.fromAccountId, input.toAccountId, amountAtoms.toString(), input.assetCode],
    );
    const response = { transfer_id: transaction.id, status: 'committed' };
    await client.query(
      `INSERT INTO idempotency_records (scope, idempotency_key, request_hash, response_status, response_body)
       VALUES ($1, $2, $3, 201, $4::JSONB)`,
      [scope, input.idempotencyKey, input.requestHash, JSON.stringify(response)],
    );
    await client.query(
      `INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload)
       VALUES ($1, 'internal_transfer.committed', 'ledger_transaction', $2, $3::JSONB)`,
      [randomUUID(), transaction.id, JSON.stringify(response)],
    );
    return { created: true, transferId: transaction.id };
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

  private async getAccountForUpdate(client: PoolClient, accountId: string): Promise<Account> {
    const result = await client.query<{
      account_kind: Account['accountKind']; id: string; owner_id: string; status: Account['status'];
    }>('SELECT id, owner_id, account_kind, status FROM accounts WHERE id = $1 FOR UPDATE', [accountId]);
    const account = result.rows[0];
    if (!account) throw new DomainError('account_not_found');
    return { accountKind: account.account_kind, id: account.id, ownerId: account.owner_id, status: account.status };
  }

  private async findOrCreateUserAccount(client: PoolClient, ownerId: string, accountKind: 'user_available' | 'user_frozen'): Promise<Account> {
    await client.query(
      `INSERT INTO accounts (id, owner_id, account_kind)
       VALUES ($1, $2, $3)
       ON CONFLICT (owner_id, account_kind) DO NOTHING`,
      [randomUUID(), ownerId, accountKind],
    );
    const result = await client.query<{
      account_kind: Account['accountKind']; id: string; owner_id: string; status: Account['status'];
    }>(
      `SELECT id, owner_id, account_kind, status
       FROM accounts WHERE owner_id = $1 AND account_kind = $2 FOR UPDATE`,
      [ownerId, accountKind],
    );
    const account = result.rows[0];
    if (!account) throw new Error('failed to create user wallet account');
    return { accountKind: account.account_kind, id: account.id, ownerId: account.owner_id, status: account.status };
  }

  private async getPlatformAccountForUpdate(client: PoolClient, ownerId: string, kind: Account['accountKind']): Promise<Account> {
    const result = await client.query<{
      account_kind: Account['accountKind']; id: string; owner_id: string; status: Account['status'];
    }>('SELECT id, owner_id, account_kind, status FROM accounts WHERE owner_id = $1 AND account_kind = $2 FOR UPDATE', [ownerId, kind]);
    const account = result.rows[0];
    if (!account) throw new DomainError('platform_not_configured');
    return { accountKind: account.account_kind, id: account.id, ownerId: account.owner_id, status: account.status };
  }

  private async ensureBalanceRows(client: PoolClient, accountIds: string[], assetCode: string): Promise<void> {
    for (const accountId of accountIds) {
      await client.query(
        `INSERT INTO account_balances (account_id, asset_code, balance_atoms)
         VALUES ($1, $2, 0) ON CONFLICT (account_id, asset_code) DO NOTHING`, [accountId, assetCode],
      );
    }
  }

  private async requireAsset(client: PoolClient, assetCode: string): Promise<void> {
    const result = await client.query('SELECT 1 FROM assets WHERE code = $1 AND enabled = true', [assetCode]);
    if (result.rowCount !== 1) throw new DomainError('asset_not_found');
  }

  private async requireChainAsset(client: PoolClient, network: string, assetCode: string, confirmationCount: number, contractIdentifier: string): Promise<void> {
    const result = await client.query<{ contract_identifier: string; minimum_confirmations: string }>(
      `SELECT contract_identifier, minimum_confirmations::STRING FROM chain_assets
       WHERE network = $1 AND asset_code = $2 AND enabled = true`, [network, assetCode],
    );
    const chainAsset = result.rows[0];
    if (!chainAsset || confirmationCount < Number(chainAsset.minimum_confirmations)) throw new DomainError('deposit_not_final');
    if (chainAsset.contract_identifier !== contractIdentifier) throw new DomainError('deposit_observation_mismatch');
  }

  private async requireEnabledChainAsset(client: PoolClient, network: string, assetCode: string): Promise<void> {
    const result = await client.query('SELECT 1 FROM chain_assets WHERE network = $1 AND asset_code = $2 AND enabled = true', [network, assetCode]);
    if (result.rowCount !== 1) throw new DomainError('chain_asset_not_enabled');
  }

  private async balanceOfForUpdate(client: PoolClient, accountId: string, assetCode: string): Promise<bigint> {
    const result = await client.query<{ balance_atoms: string }>(
      'SELECT balance_atoms::STRING FROM account_balances WHERE account_id = $1 AND asset_code = $2 FOR UPDATE', [accountId, assetCode],
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
    const parameters: unknown[] = [];
    const values = transaction.postings.map((posting, index) => {
      const offset = index * 5;
      parameters.push(posting.id, transaction.id, posting.accountId, posting.assetCode, posting.amountAtoms.toString());
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}::DECIMAL)`;
    });
    await client.query(`INSERT INTO ledger_postings (id, transaction_id, account_id, asset_code, amount_atoms) VALUES ${values.join(', ')}`, parameters);
  }

  private async applyPostings(client: PoolClient, transaction: LedgerTransaction): Promise<void> {
    for (const posting of transaction.postings) {
      const result = await client.query(
        `UPDATE account_balances AS balances SET balance_atoms = balances.balance_atoms + $3::DECIMAL, updated_at = now()
         FROM accounts
         WHERE balances.account_id = $1 AND balances.asset_code = $2 AND accounts.id = balances.account_id
           AND (accounts.account_kind = 'platform_settlement' OR balances.balance_atoms + $3::DECIMAL >= 0)`,
        [posting.accountId, posting.assetCode, posting.amountAtoms.toString()],
      );
      if (result.rowCount !== 1) throw new DomainError('insufficient_funds');
    }
  }

  private async insertOutbox(client: PoolClient, eventType: string, aggregateType: string, aggregateId: string, payload: Record<string, unknown>): Promise<void> {
    await client.query(
      `INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload)
       VALUES ($1, $2, $3, $4, $5::JSONB)`,
      [randomUUID(), eventType, aggregateType, aggregateId, JSON.stringify(payload)],
    );
  }

  private async getWithdrawalForUpdate(client: PoolClient, withdrawalId: string): Promise<Withdrawal & { accountId: string }> {
    const result = await client.query<WithdrawalRow>(
      `SELECT id, account_id, frozen_account_id, asset_code, amount_atoms::STRING, fee_atoms::STRING,
              network, destination_address, requested_by, status, chain_transaction_hash
       FROM withdrawal_requests WHERE id = $1 FOR UPDATE`, [withdrawalId],
    );
    const row = result.rows[0];
    if (!row) throw new DomainError('withdrawal_not_found');
    return {
      accountId: row.account_id,
      amountAtoms: row.amount_atoms,
      assetCode: row.asset_code,
      ...(row.chain_transaction_hash ? { chainTransactionHash: row.chain_transaction_hash } : {}),
      destinationAddress: row.destination_address,
      feeAtoms: row.fee_atoms,
      frozenAccountId: row.frozen_account_id,
      id: row.id,
      network: row.network,
      requestedBy: row.requested_by,
      status: row.status,
    };
  }
}
