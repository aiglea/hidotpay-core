import { DomainError } from '../domain/errors.js';
import { requestHash } from '../domain/idempotency.js';
import { parseNonNegativeAtoms, parsePositiveAtoms } from '../domain/money.js';
import type { DepositResult, LedgerRepository, WithdrawalResult } from '../repositories/ledger-repository.js';

export type WithdrawalFeeQuote = { feeAtoms: string; quoteId: string };

export interface WithdrawalFeePolicy {
  quote(input: { amountAtoms: string; assetCode: string; network: string }): WithdrawalFeeQuote;
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
  fromAccountId: string;
  frozenAccountId: string;
  idempotencyKey: string;
  network: string;
};

export class FundingService {
  public constructor(private readonly repository: LedgerRepository, private readonly withdrawalFeePolicy: WithdrawalFeePolicy) {}

  public async confirmDeposit(actorId: string, input: DepositConfirmationRequest): Promise<DepositResult> {
    parsePositiveAtoms(input.amountAtoms);
    if (!/^[A-Za-z0-9._:-]{2,64}$/.test(input.network)) throw new DomainError('invalid_network');
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
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(input.idempotencyKey)) throw new DomainError('invalid_idempotency_key');
    if (!/^[A-Za-z0-9._:-]{2,64}$/.test(input.network)) throw new DomainError('invalid_network');
    if (input.destinationAddress.trim().length < 8 || input.destinationAddress.length > 256) throw new DomainError('invalid_destination_address');
    parsePositiveAtoms(input.amountAtoms);
    const fee = this.withdrawalFeePolicy.quote(input);
    parseNonNegativeAtoms(fee.feeAtoms);
    return this.repository.requestWithdrawal({
      ...input,
      actorId,
      feeAtoms: fee.feeAtoms,
      feeQuoteId: fee.quoteId,
      requestHash: requestHash({
        amount_atoms: input.amountAtoms,
        asset_code: input.assetCode,
        destination_address: input.destinationAddress,
        from_account_id: input.fromAccountId,
        frozen_account_id: input.frozenAccountId,
        network: input.network,
      }),
    });
  }
}
