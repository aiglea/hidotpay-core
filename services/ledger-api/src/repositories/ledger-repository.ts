export type Account = {
  accountKind: 'platform_settlement' | 'platform_treasury' | 'p2p_escrow' | 'user_available' | 'user_frozen';
  id: string;
  ownerId: string;
  status: 'active' | 'closed' | 'suspended';
};

export type UserWallet = {
  availableAccount: Account;
  frozenAccount: Account;
};

export type Asset = {
  code: string;
  decimals: number;
};

export type IdempotentTransfer = {
  actorId: string;
  amountAtoms: string;
  assetCode: string;
  fromAccountId: string;
  idempotencyKey: string;
  requestHash: string;
  toAccountId: string;
};

export type TransferResult = {
  created: boolean;
  transferId: string;
};

export type ConfirmedDeposit = {
  actorId: string;
  amountAtoms: string;
  assetCode: string;
  confirmationCount: number;
  contractIdentifier: string;
  destinationAccountId: string;
  network: string;
  blockHash: string;
  blockHeight: string;
  outputIndex: number;
  transactionHash: string;
};

export type DepositResult = {
  created: boolean;
  depositId: string;
  transferId: string;
};

export type WithdrawalRequest = {
  actorId: string;
  amountAtoms: string;
  assetCode: string;
  destinationAddress: string;
  feeQuoteId: string;
  fromAccountId: string;
  frozenAccountId: string;
  idempotencyKey: string;
  network: string;
  requestHash: string;
  riskControls: WithdrawalRiskControls;
};

export type WithdrawalRiskControls = {
  dailyLimitAtoms: string;
  maxPerWithdrawalAtoms: string;
  whitelistCooldownMs: number;
};

export type WithdrawalResult = {
  created: boolean;
  withdrawalId: string;
};

export type WithdrawalFeeQuote = {
  expiresAt: string;
  feeAtoms: string;
  id: string;
};

export type CreateWithdrawalFeeQuote = {
  amountAtoms: string;
  assetCode: string;
  expiresAt: string;
  feeAtoms: string;
  network: string;
  userId: string;
};

export type WithdrawalStatus = 'approved' | 'broadcast' | 'confirmed' | 'failed' | 'pending_review';

export type Withdrawal = {
  amountAtoms: string;
  assetCode: string;
  chainTransactionHash?: string;
  destinationAddress: string;
  feeAtoms: string;
  frozenAccountId: string;
  id: string;
  network: string;
  requestedBy: string;
  status: WithdrawalStatus;
};

export type WalletTransaction = {
  amountAtoms: string;
  assetCode: string;
  createdAt: string;
  direction: 'incoming' | 'outgoing';
  id: string;
  type: string;
};

export type WalletTransactionPage = {
  nextCursor?: string;
  transactions: WalletTransaction[];
};

export type WalletTransactionPageRequest = {
  cursor?: string;
  limit: number;
};

export interface LedgerRepository {
  ensureUserWallet(ownerId: string): Promise<UserWallet>;
  getAccount(accountId: string): Promise<Account>;
  getBalances(accountId: string): Promise<Array<{ assetCode: string; balanceAtoms: string }>>;
  listWalletTransactions(accountId: string, page: WalletTransactionPageRequest): Promise<WalletTransactionPage>;
  createWithdrawalFeeQuote(input: CreateWithdrawalFeeQuote): Promise<WithdrawalFeeQuote>;
  confirmDeposit(input: ConfirmedDeposit): Promise<DepositResult>;
  requestWithdrawal(input: WithdrawalRequest): Promise<WithdrawalResult>;
  approveWithdrawal(withdrawalId: string, reviewerId: string): Promise<Withdrawal>;
  markWithdrawalBroadcast(withdrawalId: string, chainTransactionHash: string): Promise<Withdrawal>;
  settleWithdrawal(withdrawalId: string, chainTransactionHash: string): Promise<Withdrawal>;
  failWithdrawal(withdrawalId: string, reason: string): Promise<Withdrawal>;
  transferInternal(input: IdempotentTransfer): Promise<TransferResult>;
}
