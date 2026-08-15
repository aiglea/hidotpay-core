import { DomainError } from './errors.js';
import { parsePositiveAtoms } from './money.js';

export type P2PAd = {
  assetCode: string;
  fiatCurrency: string;
  maxAmountAtoms: string;
  minAmountAtoms: string;
  paymentMethodCode: string;
  priceAtoms: string;
  sellerId: string;
};

export function validateP2PAd(ad: P2PAd): P2PAd {
  if (!/^[A-Z0-9]{2,16}$/.test(ad.assetCode) || !/^[A-Z]{3}$/.test(ad.fiatCurrency)) throw new DomainError('invalid_p2p_ad');
  if (!/^[a-z][a-z0-9_:-]{2,63}$/.test(ad.paymentMethodCode)) throw new DomainError('invalid_p2p_payment_method');
  if (!/^[A-Za-z0-9_-]{3,128}$/.test(ad.sellerId)) throw new DomainError('invalid_p2p_ad');
  const price = parsePositiveAtoms(ad.priceAtoms);
  const minimum = parsePositiveAtoms(ad.minAmountAtoms);
  const maximum = parsePositiveAtoms(ad.maxAmountAtoms);
  if (price <= 0n || maximum < minimum) throw new DomainError('invalid_p2p_ad');
  return { ...ad };
}

export function validateP2POrderAmount(ad: P2PAd, amountAtoms: string): string {
  const validAd = validateP2PAd(ad);
  const amount = parsePositiveAtoms(amountAtoms);
  if (amount < BigInt(validAd.minAmountAtoms) || amount > BigInt(validAd.maxAmountAtoms)) throw new DomainError('p2p_order_amount_out_of_range');
  return amount.toString();
}
