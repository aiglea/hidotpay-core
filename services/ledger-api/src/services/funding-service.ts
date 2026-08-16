import { isMainnetDepositNetwork } from '../domain/deposit-credit-policy.js';
import { DomainError } from '../domain/errors.js';
import { isValidIdempotencyKey, requestHash } from '../domain/idempotency.js';
import { parseNonNegativeAtoms, parsePositiveAtoms } from '../domain/money.js';
import type { DepositResult, LedgerRepository, WithdrawalFeeQuote as PersistedWithdrawalFeeQuote, WithdrawalResult, WithdrawalRiskControls } from '../repositories/ledger-repository.js';

export type FeeScheduleQuote = { feeAtoms: string; quoteId: string };

export interface WithdrawalFeePolicy {
  quote(input: { amountAtoms: string; assetCode: string; network: string }): FeeScheduleQuote;
}

export function fixedWithdrawalFeePolicy(schedule: Record<string, string>): WithdrawalFeePolicy {
  return {
    quote(input) {
      const feeAtoms = schedule[`${input.network}:${input.assetCode}`];
      if (feeAtoms === undefined) throw new DomainError('fee_quote_unavailable');
      parseNonNegativeAtoms(feeAtoms);
      return { feeAtoms, quoteId: `fixed:${input.network}:${input.assetCode}:${feeAtoms}` };
    },
  };
}

export type DepositConfirmationRequest = {
  amountAtoms: string;
  assetCode: string;
  blockHash: string;
  blockHeight: string;
  confirmationCount: number;
  contractIdentifier: string;
  destinationAccountId: string;
  network: string;
  outputIndex: number;
  transactionHash: string;
};

export type WithdrawalRequestInput = {
  amountAtoms: string;
  assetCode: string;
  destinationAddress: string;
  feeQuoteId: string;
  fromAccountId: string;
  frozenAccountId: string;
  idempotencyKey: string;
  network: string;
};

export type WithdrawalFeeQuoteInput = Pick<WithdrawalRequestInput, 'amountAtoms' | 'assetCode' | 'network'>;

export class FundingService {
  public constructor(
    private readonly repository: Pick<LedgerRepository, 'confirmDeposit' | 'createWithdrawalFeeQuote' | 'requestWithdrawal'>,
    private readonly withdrawalFeePolicy: WithdrawalFeePolicy,
    private readonly config: { riskControls?: WithdrawalRiskControls; withdrawalsEnabled?: boolean } = {},
  ) {}

  public async confirmDeposit(actorId: string, input: DepositConfirmationRequest): Promise<DepositResult> {
    parsePositiveAtoms(input.amountAtoms);
    if (!/^[A-Za-z0-9._:-]{2,64}$/.test(input.network)) throw new DomainError('invalid_network');
    if (isMainnetDepositNetwork(input.network)) throw new DomainError('deposit_mainnet_disabled');
    if (!/^[A-Za-z0-9:_-]{8,256}$/.test(input.transactionHash)) throw new DomainError('invalid_chain_transaction');
    if (!/^[A-Za-z0-9._:-]{2,256}$/.test(input.contractIdentifier) || !/^[1-9][0-9]*$/.test(input.blockHeight) || !/^[A-Za-z0-9:_-]{8,256}$/.test(input.blockHash)) {
      throw new DomainError('invalid_deposit');
    }
    if (!Number.isInteger(input.outputIndex) || input.outputIndex < 0 || !Number.isInteger(input.confirmationCount) || input.confirmationCount <= 0) {
      throw new DomainError('invalid_deposit');
    }
    return this.repository.confirmDeposit({ ...input, actorId });
  }

  public async requestWithdrawal(actorId: string, input: WithdrawalRequestInput): Promise<WithdrawalResult> {
    if (this.config.withdrawalsEnabled === false) throw new DomainError('withdrawals_disabled');
    if (!isValidIdempotencyKey(input.idempotencyKey)) throw new DomainError('invalid_idempotency_key');
    if (!/^[A-Za-z0-9._:-]{2,64}$/.test(input.network)) throw new DomainError('invalid_network');
    if (input.destinationAddress.trim().length < 8 || input.destinationAddress.length > 256) throw new DomainError('invalid_destination_address');
    parsePositiveAtoms(input.amountAtoms);
    return this.repository.requestWithdrawal({
      ...input,
      actorId,
      riskControls: this.config.riskControls ?? {
        dailyLimitAtoms: '1000000000000',
        maxPerWithdrawalAtoms: '1000000000000',
        whitelistCooldownMs: 24 * 60 * 60 * 1000,
      },
      requestHash: requestHash({
        amount_atoms: input.amountAtoms,
        asset_code: input.assetCode,
        destination_address: input.destinationAddress,
        fee_quote_id: input.feeQuoteId,
        from_account_id: input.fromAccountId,
        frozen_account_id: input.frozenAccountId,
        network: input.network,
      }),
    });
  }

  public async quoteWithdrawalFee(actorId: string, input: WithdrawalFeeQuoteInput): Promise<PersistedWithdrawalFeeQuote> {
    parsePositiveAtoms(input.amountAtoms);
    if (!/^[A-Za-z0-9._:-]{2,64}$/.test(input.network)) throw new DomainError('invalid_network');
    const fee = this.withdrawalFeePolicy.quote(input);
    parseNonNegativeAtoms(fee.feeAtoms);
    return this.repository.createWithdrawalFeeQuote({
      amountAtoms: input.amountAtoms,
      assetCode: input.assetCode,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      feeAtoms: fee.feeAtoms,
      network: input.network,
      userId: actorId,
    });
  }
}
