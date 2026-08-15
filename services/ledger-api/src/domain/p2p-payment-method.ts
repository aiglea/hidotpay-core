import { DomainError } from './errors.js';

export type P2PPaymentMethod = {
  accountHolderName: string;
  accountReference: string;
  currency: string;
  methodCode: 'bank_transfer' | 'e_wallet';
  ownerId: string;
};

/** Public-safe fields only. The real account identifier belongs in a KMS-encrypted private payload. */
export function validateP2PPaymentMethod(input: P2PPaymentMethod): P2PPaymentMethod {
  if (!/^[A-Za-z0-9._:-]{3,128}$/.test(input.ownerId)) throw new DomainError('invalid_p2p_payment_method_owner');
  if (input.methodCode !== 'bank_transfer' && input.methodCode !== 'e_wallet') throw new DomainError('invalid_p2p_payment_method');
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new DomainError('invalid_p2p_payment_currency');
  if (typeof input.accountHolderName !== 'string' || input.accountHolderName.trim().length < 2 || input.accountHolderName.trim().length > 120) throw new DomainError('invalid_p2p_payment_holder');
  if (!/^[A-Za-z0-9*_-]{4,80}$/.test(input.accountReference) || !input.accountReference.includes('*')) throw new DomainError('invalid_p2p_payment_reference');
  return { ...input, accountHolderName: input.accountHolderName.trim() };
}
