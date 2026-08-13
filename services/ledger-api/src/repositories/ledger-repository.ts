export type Account = {
  accountKind: 'platform_settlement' | 'platform_treasury' | 'user_available' | 'user_frozen';
  id: string;
  ownerId: string;
  status: 'active' | 'closed' | 'suspended';
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
  feeAtoms: string;
  feeQuoteId: string;
  fromAccountId: string;
  frozenAccountId: string;
  idempotencyKey: string;
  network: string;
  requestHash: string;
};

export type WithdrawalResult = {
  created: boolean;
  withdrawalId: string;
};

export type WithdrawalStatus = 'approved' | 'confirmed' | 'failed' | 'pending_review';

export type Withdrawal = {
  amountAtoms: string;
  assetCode: string;
  destinationAddress: string;
  feeAtoms: string;
  frozenAccountId: string;
  id: string;
  network: string;
  requestedBy: string;
  status: WithdrawalStatus;
};

export interface LedgerRepository {
  getAccount(accountId: string): Promise<Account>;
  getBalances(accountId: string): Promise<Array<{ assetCode: string; balanceAtoms: string }>>;
  confirmDeposit(input: ConfirmedDeposit): Promise<DepositResult>;
  requestWithdrawal(input: WithdrawalRequest): Promise<WithdrawalResult>;
  approveWithdrawal(withdrawalId: string, reviewerId: string): Promise<Withdrawal>;
  settleWithdrawal(withdrawalId: string, chainTransactionHash: string): Promise<Withdrawal>;
  failWithdrawal(withdrawalId: string, reason: string): Promise<Withdrawal>;
  transferInternal(input: IdempotentTransfer): Promise<TransferResult>;
}
