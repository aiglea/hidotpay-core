import { DomainError } from '../domain/errors.js';
import { requestHash } from '../domain/idempotency.js';
import { parsePositiveAtoms } from '../domain/money.js';
import type { LedgerRepository, TransferResult } from '../repositories/ledger-repository.js';

export type InternalTransferRequest = {
  amountAtoms: string;
  assetCode: string;
  fromAccountId: string;
  idempotencyKey: string;
  toAccountId: string;
};

export class TransferService {
  public constructor(private readonly repository: LedgerRepository) {}

  public async transferInternal(actorId: string, request: InternalTransferRequest): Promise<TransferResult> {
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(request.idempotencyKey)) throw new DomainError('invalid_idempotency_key');
    parsePositiveAtoms(request.amountAtoms);
    return this.repository.transferInternal({
      ...request,
      actorId,
      requestHash: requestHash({
        amount_atoms: request.amountAtoms,
        asset_code: request.assetCode,
        from_account_id: request.fromAccountId,
        to_account_id: request.toAccountId,
      }),
    });
  }
}
