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
  transactionType: 'internal_transfer';
};

export type InternalTransferInput = {
  amountAtoms: string;
  assetCode: string;
  fromAccountId: string;
  toAccountId: string;
};

export function sumPostings(postings: Posting[]): bigint {
  return postings.reduce((total, posting) => total + posting.amountAtoms, 0n);
}

export function buildInternalTransfer(input: InternalTransferInput): LedgerTransaction {
  if (input.fromAccountId === input.toAccountId) throw new DomainError('same_account');
  if (!/^[A-Z0-9]{2,16}$/.test(input.assetCode)) throw new DomainError('invalid_asset');
  const amountAtoms = parsePositiveAtoms(input.amountAtoms);
  const transaction: LedgerTransaction = {
    id: randomUUID(),
    postings: [
      { accountId: input.fromAccountId, amountAtoms: -amountAtoms, assetCode: input.assetCode, id: randomUUID() },
      { accountId: input.toAccountId, amountAtoms, assetCode: input.assetCode, id: randomUUID() },
    ],
    transactionType: 'internal_transfer',
  };
  if (sumPostings(transaction.postings) !== 0n) throw new DomainError('unbalanced_transaction');
  return transaction;
}
