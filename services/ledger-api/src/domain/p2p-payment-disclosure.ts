import { DomainError } from './errors.js';

export function requireP2PPaymentDisclosure(input: { actorId: string; buyerId: string; status: string }): void {
  if (input.actorId !== input.buyerId || (input.status !== 'awaiting_payment' && input.status !== 'awaiting_release')) {
    throw new DomainError('p2p_payment_details_forbidden');
  }
}
