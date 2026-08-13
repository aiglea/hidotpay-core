import { randomUUID } from 'node:crypto';

import { DomainError } from './errors.js';
import { parsePositiveAtoms } from './money.js';

export type Posting = {
  accountId: string;
  amountAtoms: bigint;
  assetCode: string;
  id: string;
};

export type LedgerTransaction = {
  id: string;
  postings: Posting[];
  transactionType: LedgerTransactionType;
};

export type LedgerTransactionType =
  | 'deposit_credit'
  | 'internal_transfer'
  | 'withdrawal_freeze'
  | 'withdrawal_release'
  | 'withdrawal_settle';

export type PostingInput = Omit<Posting, 'amountAtoms' | 'id'> & { amountAtoms: string };

export type InternalTransferInput = {
  amountAtoms: string;
  assetCode: string;
  fromAccountId: string;
  toAccountId: string;
};

export function sumPostings(postings: Posting[]): bigint {
  return postings.reduce((total, posting) => total + posting.amountAtoms, 0n);
}

export function buildTransaction(transactionType: LedgerTransactionType, inputs: PostingInput[]): LedgerTransaction {
  if (inputs.length < 2) throw new DomainError('unbalanced_transaction');
  const postings = inputs.map((input) => {
    if (!/^[A-Z0-9]{2,16}$/.test(input.assetCode)) throw new DomainError('invalid_asset');
    if (!/^-?[1-9][0-9]*$/.test(input.amountAtoms)) throw new DomainError('invalid_amount');
    return {
      accountId: input.accountId,
      amountAtoms: BigInt(input.amountAtoms),
      assetCode: input.assetCode,
      id: randomUUID(),
    };
  });
  const totalsByAsset = new Map<string, bigint>();
  for (const posting of postings) {
    totalsByAsset.set(posting.assetCode, (totalsByAsset.get(posting.assetCode) ?? 0n) + posting.amountAtoms);
  }
  if ([...totalsByAsset.values()].some((total) => total !== 0n)) throw new DomainError('unbalanced_transaction');
  return { id: randomUUID(), postings, transactionType };
}

export function buildInternalTransfer(input: InternalTransferInput): LedgerTransaction {
  if (input.fromAccountId === input.toAccountId) throw new DomainError('same_account');
  if (!/^[A-Z0-9]{2,16}$/.test(input.assetCode)) throw new DomainError('invalid_asset');
  const amountAtoms = parsePositiveAtoms(input.amountAtoms);
  return buildTransaction('internal_transfer', [
    { accountId: input.fromAccountId, amountAtoms: (-amountAtoms).toString(), assetCode: input.assetCode },
    { accountId: input.toAccountId, amountAtoms: amountAtoms.toString(), assetCode: input.assetCode },
  ]);
}
