import { DomainError } from '../domain/errors.js';

export type FeeQuote = { expiresAt: string; feeAtoms: string; id: string };
export type WithdrawalRiskInput = {
  amountAtoms: string;
  destinationAddress: string;
  feeQuote: FeeQuote;
  usedTodayAtoms: string;
  userId: string;
  whitelistAddedAt: string;
};

export class RiskService {
  private readonly dailyLimitAtoms: bigint;
  private readonly maxPerWithdrawalAtoms: bigint;

  public constructor(private readonly config: {
    dailyLimitAtoms: string;
    maxPerWithdrawalAtoms: string;
    now: () => Date;
    whitelistCooldownMs: number;
  }) {
    this.dailyLimitAtoms = parsePositive(config.dailyLimitAtoms);
    this.maxPerWithdrawalAtoms = parsePositive(config.maxPerWithdrawalAtoms);
    if (!Number.isSafeInteger(config.whitelistCooldownMs) || config.whitelistCooldownMs < 0) throw new Error('invalid whitelist cooldown');
  }

  public assessWithdrawal(input: WithdrawalRiskInput): { allowed: true; totalAtoms: string } {
    const amountAtoms = parsePositive(input.amountAtoms);
    const feeAtoms = parseNonNegative(input.feeQuote.feeAtoms);
    const usedTodayAtoms = parseNonNegative(input.usedTodayAtoms);
    const now = this.config.now();
    const expiresAt = new Date(input.feeQuote.expiresAt);
    const whitelistAddedAt = new Date(input.whitelistAddedAt);
    if (!input.feeQuote.id || Number.isNaN(expiresAt.valueOf()) || expiresAt <= now) throw new DomainError('fee_quote_expired');
    if (amountAtoms > this.maxPerWithdrawalAtoms) throw new DomainError('withdrawal_limit_exceeded');
    if (usedTodayAtoms + amountAtoms > this.dailyLimitAtoms) throw new DomainError('daily_limit_exceeded');
    if (Number.isNaN(whitelistAddedAt.valueOf()) || now.valueOf() - whitelistAddedAt.valueOf() < this.config.whitelistCooldownMs) {
      throw new DomainError('withdrawal_whitelist_cooling_down');
    }
    if (this.isBlockedAddress(input.destinationAddress)) throw new DomainError('destination_address_blocked');
    return { allowed: true, totalAtoms: (amountAtoms + feeAtoms).toString() };
  }

  private isBlockedAddress(address: string): boolean {
    return /^0x0{40}$/i.test(address) || /^T1{33}$/.test(address);
  }
}

function parsePositive(value: string): bigint {
  if (!/^[1-9][0-9]*$/.test(value)) throw new DomainError('invalid_amount');
  return BigInt(value);
}

function parseNonNegative(value: string): bigint {
  if (!/^[0-9]+$/.test(value)) throw new DomainError('invalid_amount');
  return BigInt(value);
}
