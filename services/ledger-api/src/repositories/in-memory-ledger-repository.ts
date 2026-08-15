import { randomUUID } from 'node:crypto';

import { DomainError } from '../domain/errors.js';
import { buildInternalTransfer, buildTransaction } from '../domain/ledger.js';
import { parseNonNegativeAtoms, parsePositiveAtoms } from '../domain/money.js';
import { RiskService } from '../services/risk-service.js';
import type {
  Account,
  Asset,
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

type StoredIdempotency = {
  requestHash: string;
  transferId: string;
};

export class InMemoryLedgerRepository implements LedgerRepository {
  private readonly accounts = new Map<string, Account>();
  private readonly assets = new Map<string, Asset>();
  private readonly chainAssets = new Map<string, { contractIdentifier: string; minimumConfirmations: number }>();
  private readonly balances = new Map<string, bigint>();
  private readonly idempotency = new Map<string, StoredIdempotency>();
  private readonly deposits = new Map<string, DepositResult>();
  private readonly withdrawals = new Map<string, Withdrawal>();
  private readonly withdrawalIdempotency = new Map<string, { requestHash: string; withdrawalId: string }>();
  private readonly withdrawalFeeQuotes = new Map<string, WithdrawalFeeQuote & { amountAtoms: string; assetCode: string; consumed: boolean; network: string; userId: string }>();
  private readonly withdrawalWhitelists = new Map<string, { addedAt: string; status: 'active' | 'blocked' | 'pending_cooldown' }>();
  private readonly withdrawalRequestedAt = new Map<string, Date>();

  public seedAccount(account: Omit<Account, 'status'> & { status?: Account['status'] }): void {
    this.accounts.set(account.id, { ...account, status: account.status ?? 'active' });
  }

  public async ensureUserWallet(ownerId: string): Promise<UserWallet> {
    const availableAccount = this.findOrCreateUserAccount(ownerId, 'user_available');
    const frozenAccount = this.findOrCreateUserAccount(ownerId, 'user_frozen');
    return { availableAccount: { ...availableAccount }, frozenAccount: { ...frozenAccount } };
  }

  public seedAsset(asset: Asset): void {
    this.assets.set(asset.code, asset);
  }

  public seedChainAsset(network: string, assetCode: string, minimumConfirmations: number, contractIdentifier = 'native'): void {
    this.chainAssets.set(`${network}:${assetCode}`, { contractIdentifier, minimumConfirmations });
  }

  public seedBalance(accountId: string, assetCode: string, amountAtoms: string): void {
    this.balances.set(this.balanceKey(accountId, assetCode), parseNonNegativeAtoms(amountAtoms));
  }

  public seedWithdrawalWhitelist(input: { addedAt: string; address: string; network: string; status: 'active' | 'blocked' | 'pending_cooldown'; userId: string }): void {
    this.withdrawalWhitelists.set(this.whitelistKey(input.userId, input.network, input.address), { addedAt: input.addedAt, status: input.status });
  }

  public balanceOf(accountId: string, assetCode: string): string {
    return (this.balances.get(this.balanceKey(accountId, assetCode)) ?? 0n).toString();
  }

  public async getBalances(accountId: string): Promise<Array<{ assetCode: string; balanceAtoms: string }>> {
    if (!this.accounts.has(accountId)) throw new DomainError('account_not_found');
    return [...this.balances.entries()]
      .filter(([key]) => key.startsWith(`${accountId}:`))
      .map(([key, balanceAtoms]) => ({ assetCode: key.slice(accountId.length + 1), balanceAtoms: balanceAtoms.toString() }))
      .sort((left, right) => left.assetCode.localeCompare(right.assetCode));
  }

  public async getAccount(accountId: string): Promise<Account> {
    const account = this.accounts.get(accountId);
    if (!account) throw new DomainError('account_not_found');
    return { ...account };
  }

  public async createWithdrawalFeeQuote(input: CreateWithdrawalFeeQuote): Promise<WithdrawalFeeQuote> {
    parsePositiveAtoms(input.amountAtoms);
    parseNonNegativeAtoms(input.feeAtoms);
    if (!this.assets.has(input.assetCode)) throw new DomainError('asset_not_found');
    if (!this.chainAssets.has(`${input.network}:${input.assetCode}`)) throw new DomainError('chain_asset_not_enabled');
    const expiresAt = new Date(input.expiresAt);
    if (Number.isNaN(expiresAt.valueOf()) || expiresAt <= new Date()) throw new DomainError('invalid_fee_quote');
    const quote: WithdrawalFeeQuote & { amountAtoms: string; assetCode: string; consumed: boolean; network: string; userId: string } = {
      amountAtoms: input.amountAtoms,
      assetCode: input.assetCode,
      consumed: false,
      expiresAt: expiresAt.toISOString(),
      feeAtoms: input.feeAtoms,
      id: randomUUID(),
      network: input.network,
      userId: input.userId,
    };
    this.withdrawalFeeQuotes.set(quote.id, quote);
    return { expiresAt: quote.expiresAt, feeAtoms: quote.feeAtoms, id: quote.id };
  }

  public async confirmDeposit(input: ConfirmedDeposit): Promise<DepositResult> {
    const receiptKey = `${input.network}:${input.transactionHash}:${input.outputIndex}`;
    const existing = this.deposits.get(receiptKey);
    if (existing) return { ...existing, created: false };
    if (!Number.isInteger(input.confirmationCount) || input.confirmationCount <= 0 || !Number.isInteger(input.outputIndex) || input.outputIndex < 0) {
      throw new DomainError('invalid_deposit');
    }
    const amountAtoms = parsePositiveAtoms(input.amountAtoms);
    const destination = this.requireAccount(input.destinationAccountId);
    const settlement = this.platformSettlement();
    if (destination.accountKind !== 'user_available' || destination.status !== 'active' || settlement.status !== 'active') {
      throw new DomainError('account_unavailable');
    }
    if (!this.assets.has(input.assetCode)) throw new DomainError('asset_not_found');
    if (!this.chainAssets.has(`${input.network}:${input.assetCode}`)) throw new DomainError('chain_asset_not_enabled');
    const chainAsset = this.chainAssets.get(`${input.network}:${input.assetCode}`);
    if (!chainAsset || input.confirmationCount < chainAsset.minimumConfirmations) throw new DomainError('deposit_not_final');
    if (chainAsset.contractIdentifier !== input.contractIdentifier) throw new DomainError('deposit_observation_mismatch');

    const transaction = buildTransaction('deposit_credit', [
      { accountId: settlement.id, amountAtoms: (-amountAtoms).toString(), assetCode: input.assetCode },
      { accountId: destination.id, amountAtoms: amountAtoms.toString(), assetCode: input.assetCode },
    ]);
    this.applyTransaction(transaction.postings.map((posting) => ({ accountId: posting.accountId, assetCode: posting.assetCode, amountAtoms: posting.amountAtoms })));
    const result = { created: true, depositId: randomUUID(), transferId: transaction.id };
    this.deposits.set(receiptKey, result);
    return result;
  }

  public async requestWithdrawal(input: WithdrawalRequest): Promise<WithdrawalResult> {
    const scope = `withdrawal:${input.actorId}`;
    const idempotencyKey = `${scope}:${input.idempotencyKey}`;
    const existing = this.withdrawalIdempotency.get(idempotencyKey);
    if (existing) {
      if (existing.requestHash !== input.requestHash) throw new DomainError('idempotency_conflict');
      return { created: false, withdrawalId: existing.withdrawalId };
    }
    const amountAtoms = parsePositiveAtoms(input.amountAtoms);
    const quote = this.withdrawalFeeQuotes.get(input.feeQuoteId);
    if (!quote || quote.consumed || quote.userId !== input.actorId || quote.network !== input.network || quote.assetCode !== input.assetCode || quote.amountAtoms !== input.amountAtoms) {
      throw new DomainError('fee_quote_invalid');
    }
    if (new Date(quote.expiresAt) <= new Date()) throw new DomainError('fee_quote_expired');
    const feeAtoms = parseNonNegativeAtoms(quote.feeAtoms);
    const whitelist = this.withdrawalWhitelists.get(this.whitelistKey(input.actorId, input.network, input.destinationAddress));
    if (!whitelist) throw new DomainError('withdrawal_whitelist_missing');
    if (whitelist.status === 'blocked') throw new DomainError('destination_address_blocked');
    if (whitelist.status !== 'active') throw new DomainError('withdrawal_whitelist_cooling_down');
    const now = new Date();
    const usedTodayAtoms = [...this.withdrawals.values()]
      .filter((withdrawal) => withdrawal.requestedBy === input.actorId && withdrawal.assetCode === input.assetCode && withdrawal.status !== 'failed')
      .filter((withdrawal) => this.sameUtcDay(this.withdrawalRequestedAt.get(withdrawal.id) ?? now, now))
      .reduce((total, withdrawal) => total + BigInt(withdrawal.amountAtoms), 0n);
    new RiskService({
      dailyLimitAtoms: input.riskControls.dailyLimitAtoms,
      maxPerWithdrawalAtoms: input.riskControls.maxPerWithdrawalAtoms,
      now: () => now,
      whitelistCooldownMs: input.riskControls.whitelistCooldownMs,
    }).assessWithdrawal({
      amountAtoms: input.amountAtoms,
      destinationAddress: input.destinationAddress,
      feeQuote: { expiresAt: quote.expiresAt, feeAtoms: quote.feeAtoms, id: quote.id },
      usedTodayAtoms: usedTodayAtoms.toString(),
      userId: input.actorId,
      whitelistAddedAt: whitelist.addedAt,
    });
    const totalAtoms = amountAtoms + feeAtoms;
    const source = this.requireAccount(input.fromAccountId);
    const frozen = this.requireAccount(input.frozenAccountId);
    if (source.ownerId !== input.actorId) throw new DomainError('account_not_owned');
    if (source.accountKind !== 'user_available' || frozen.accountKind !== 'user_frozen' || frozen.ownerId !== source.ownerId || source.status !== 'active' || frozen.status !== 'active') {
      throw new DomainError('account_unavailable');
    }
    if (!this.assets.has(input.assetCode)) throw new DomainError('asset_not_found');
    if (!this.chainAssets.has(`${input.network}:${input.assetCode}`)) throw new DomainError('chain_asset_not_enabled');
    if ((this.balances.get(this.balanceKey(source.id, input.assetCode)) ?? 0n) < totalAtoms) throw new DomainError('insufficient_funds');

    const freeze = buildTransaction('withdrawal_freeze', [
      { accountId: source.id, amountAtoms: (-totalAtoms).toString(), assetCode: input.assetCode },
      { accountId: frozen.id, amountAtoms: totalAtoms.toString(), assetCode: input.assetCode },
    ]);
    this.applyTransaction(freeze.postings.map((posting) => ({ accountId: posting.accountId, assetCode: posting.assetCode, amountAtoms: posting.amountAtoms })));
    const withdrawal: Withdrawal = {
      amountAtoms: amountAtoms.toString(), assetCode: input.assetCode, destinationAddress: input.destinationAddress,
      feeAtoms: feeAtoms.toString(), frozenAccountId: frozen.id, id: randomUUID(), network: input.network,
      requestedBy: input.actorId, status: 'pending_review',
    };
    this.withdrawals.set(withdrawal.id, withdrawal);
    this.withdrawalRequestedAt.set(withdrawal.id, now);
    quote.consumed = true;
    this.withdrawalIdempotency.set(idempotencyKey, { requestHash: input.requestHash, withdrawalId: withdrawal.id });
    return { created: true, withdrawalId: withdrawal.id };
  }

  public async approveWithdrawal(withdrawalId: string, reviewerId: string): Promise<Withdrawal> {
    const withdrawal = this.requireWithdrawal(withdrawalId);
    if (withdrawal.status !== 'pending_review') throw new DomainError('invalid_withdrawal_state');
    if (withdrawal.requestedBy === reviewerId) throw new DomainError('self_approval_forbidden');
    withdrawal.status = 'approved';
    return { ...withdrawal };
  }

  public async settleWithdrawal(withdrawalId: string, chainTransactionHash: string): Promise<Withdrawal> {
    const withdrawal = this.requireWithdrawal(withdrawalId);
    if (withdrawal.status === 'confirmed' && withdrawal.chainTransactionHash === chainTransactionHash) return { ...withdrawal };
    if (withdrawal.status !== 'broadcast') throw new DomainError('invalid_withdrawal_state');
    if (!/^[A-Za-z0-9:_-]{8,256}$/.test(chainTransactionHash)) throw new DomainError('invalid_chain_transaction');
    if (withdrawal.chainTransactionHash !== chainTransactionHash) throw new DomainError('invalid_chain_transaction');
    const amountAtoms = BigInt(withdrawal.amountAtoms);
    const feeAtoms = BigInt(withdrawal.feeAtoms);
    const settlement = this.platformSettlement();
    const treasury = this.platformTreasury();
    const transaction = buildTransaction('withdrawal_settle', [
      { accountId: withdrawal.frozenAccountId, amountAtoms: (-(amountAtoms + feeAtoms)).toString(), assetCode: withdrawal.assetCode },
      { accountId: settlement.id, amountAtoms: amountAtoms.toString(), assetCode: withdrawal.assetCode },
      { accountId: treasury.id, amountAtoms: feeAtoms.toString(), assetCode: withdrawal.assetCode },
    ].filter((posting) => posting.amountAtoms !== '0'));
    this.applyTransaction(transaction.postings.map((posting) => ({ accountId: posting.accountId, assetCode: posting.assetCode, amountAtoms: posting.amountAtoms })));
    withdrawal.status = 'confirmed';
    return { ...withdrawal };
  }

  public async markWithdrawalBroadcast(withdrawalId: string, chainTransactionHash: string): Promise<Withdrawal> {
    const withdrawal = this.requireWithdrawal(withdrawalId);
    if (!/^[A-Za-z0-9:_-]{8,256}$/.test(chainTransactionHash)) throw new DomainError('invalid_chain_transaction');
    if (withdrawal.status === 'broadcast') {
      if (withdrawal.chainTransactionHash !== chainTransactionHash) throw new DomainError('invalid_chain_transaction');
      return { ...withdrawal };
    }
    if (withdrawal.status !== 'approved') throw new DomainError('invalid_withdrawal_state');
    withdrawal.chainTransactionHash = chainTransactionHash;
    withdrawal.status = 'broadcast';
    return { ...withdrawal };
  }

  public async failWithdrawal(withdrawalId: string, reason: string): Promise<Withdrawal> {
    const withdrawal = this.requireWithdrawal(withdrawalId);
    if (withdrawal.status !== 'pending_review' && withdrawal.status !== 'approved') throw new DomainError('invalid_withdrawal_state');
    if (reason.trim().length === 0 || reason.length > 512) throw new DomainError('invalid_withdrawal_failure');
    const totalAtoms = BigInt(withdrawal.amountAtoms) + BigInt(withdrawal.feeAtoms);
    const source = [...this.accounts.values()].find((account) => account.ownerId === withdrawal.requestedBy && account.accountKind === 'user_available');
    if (!source) throw new DomainError('account_not_found');
    const release = buildTransaction('withdrawal_release', [
      { accountId: withdrawal.frozenAccountId, amountAtoms: (-totalAtoms).toString(), assetCode: withdrawal.assetCode },
      { accountId: source.id, amountAtoms: totalAtoms.toString(), assetCode: withdrawal.assetCode },
    ]);
    this.applyTransaction(release.postings.map((posting) => ({ accountId: posting.accountId, assetCode: posting.assetCode, amountAtoms: posting.amountAtoms })));
    withdrawal.status = 'failed';
    return { ...withdrawal };
  }

  public async transferInternal(input: IdempotentTransfer): Promise<TransferResult> {
    const scope = `internal_transfer:${input.actorId}`;
    const idempotencyKey = `${scope}:${input.idempotencyKey}`;
    const existing = this.idempotency.get(idempotencyKey);
    if (existing) {
      if (existing.requestHash !== input.requestHash) throw new DomainError('idempotency_conflict');
      return { created: false, transferId: existing.transferId };
    }

    const source = this.accounts.get(input.fromAccountId);
    const destination = this.accounts.get(input.toAccountId);
    if (!source || !destination) throw new DomainError('account_not_found');
    if (source.ownerId !== input.actorId) throw new DomainError('account_not_owned');
    if (source.accountKind !== 'user_available' || destination.accountKind !== 'user_available' || source.status !== 'active' || destination.status !== 'active') {
      throw new DomainError('account_unavailable');
    }
    if (!this.assets.has(input.assetCode)) throw new DomainError('asset_not_found');

    const amountAtoms = parsePositiveAtoms(input.amountAtoms);
    const sourceKey = this.balanceKey(input.fromAccountId, input.assetCode);
    const destinationKey = this.balanceKey(input.toAccountId, input.assetCode);
    const sourceBalance = this.balances.get(sourceKey) ?? 0n;
    if (sourceBalance < amountAtoms) throw new DomainError('insufficient_funds');

    const transaction = buildInternalTransfer(input);
    this.balances.set(sourceKey, sourceBalance + (transaction.postings[0]?.amountAtoms ?? 0n));
    this.balances.set(destinationKey, (this.balances.get(destinationKey) ?? 0n) + (transaction.postings[1]?.amountAtoms ?? 0n));
    this.idempotency.set(idempotencyKey, { requestHash: input.requestHash, transferId: transaction.id });
    return { created: true, transferId: transaction.id };
  }

  private balanceKey(accountId: string, assetCode: string): string {
    return `${accountId}:${assetCode}`;
  }

  private whitelistKey(userId: string, network: string, address: string): string {
    return `${userId}:${network}:${address}`;
  }

  private sameUtcDay(left: Date, right: Date): boolean {
    return left.getUTCFullYear() === right.getUTCFullYear() && left.getUTCMonth() === right.getUTCMonth() && left.getUTCDate() === right.getUTCDate();
  }

  private applyTransaction(postings: Array<{ accountId: string; assetCode: string; amountAtoms: bigint }>): void {
    const nextBalances = new Map<string, bigint>();
    for (const posting of postings) {
      const key = this.balanceKey(posting.accountId, posting.assetCode);
      const next = (nextBalances.get(key) ?? this.balances.get(key) ?? 0n) + posting.amountAtoms;
      const account = this.requireAccount(posting.accountId);
      if (account.accountKind !== 'platform_settlement' && next < 0n) {
        throw new DomainError('insufficient_funds');
      }
      nextBalances.set(key, next);
    }
    for (const [key, balance] of nextBalances) {
      this.balances.set(key, balance);
    }
  }

  private platformSettlement(): Account {
    const account = [...this.accounts.values()].find((candidate) => candidate.ownerId === 'platform:settlement' && candidate.accountKind === 'platform_settlement');
    if (!account) throw new DomainError('platform_not_configured');
    return account;
  }

  private platformTreasury(): Account {
    const account = [...this.accounts.values()].find((candidate) => candidate.ownerId === 'platform:treasury' && candidate.accountKind === 'platform_treasury');
    if (!account) throw new DomainError('platform_not_configured');
    return account;
  }

  private requireAccount(accountId: string): Account {
    const account = this.accounts.get(accountId);
    if (!account) throw new DomainError('account_not_found');
    return account;
  }

  private findOrCreateUserAccount(ownerId: string, accountKind: 'user_available' | 'user_frozen'): Account {
    const existing = [...this.accounts.values()].find((account) => account.ownerId === ownerId && account.accountKind === accountKind);
    if (existing) return existing;
    const account: Account = { accountKind, id: randomUUID(), ownerId, status: 'active' };
    this.accounts.set(account.id, account);
    return account;
  }

  private requireWithdrawal(withdrawalId: string): Withdrawal {
    const withdrawal = this.withdrawals.get(withdrawalId);
    if (!withdrawal) throw new DomainError('withdrawal_not_found');
    return withdrawal;
  }
}
