import { DomainError } from './errors.js';

export type P2POrderStatus = 'awaiting_payment' | 'awaiting_release' | 'cancelled' | 'disputed' | 'released';
export const P2P_TIMEOUT_ACTOR = 'p2p_timeout_worker';

export type P2POrder = {
  assetCode: string;
  buyerId: string;
  id: string;
  sellerId: string;
  status: P2POrderStatus;
};

export type P2POrderAction = 'buyer_marked_paid' | 'seller_release' | 'seller_cancel' | 'open_dispute' | 'arbitrator_release_buyer' | 'arbitrator_refund_seller' | 'system_timeout_refund';

export function transitionP2POrder(order: P2POrder, action: P2POrderAction, actorId: string): P2POrder {
  if (order.buyerId === order.sellerId) throw new DomainError('p2p_self_dealing_forbidden');
  const belongsToBuyer = actorId === order.buyerId;
  const belongsToSeller = actorId === order.sellerId;
  const isArbitrator = !belongsToBuyer && !belongsToSeller;

  if (action === 'buyer_marked_paid' && order.status === 'awaiting_payment' && belongsToBuyer) return { ...order, status: 'awaiting_release' };
  if (action === 'seller_release' && order.status === 'awaiting_release' && belongsToSeller) return { ...order, status: 'released' };
  if (action === 'seller_cancel' && order.status === 'awaiting_payment' && belongsToSeller) return { ...order, status: 'cancelled' };
  if (action === 'open_dispute' && (order.status === 'awaiting_payment' || order.status === 'awaiting_release') && (belongsToBuyer || belongsToSeller)) return { ...order, status: 'disputed' };
  if (action === 'arbitrator_release_buyer' && order.status === 'disputed' && isArbitrator) return { ...order, status: 'released' };
  if (action === 'arbitrator_refund_seller' && order.status === 'disputed' && isArbitrator) return { ...order, status: 'cancelled' };
  if (action === 'system_timeout_refund' && order.status === 'awaiting_payment' && actorId === P2P_TIMEOUT_ACTOR) return { ...order, status: 'cancelled' };
  throw new DomainError('invalid_p2p_order_transition');
}
