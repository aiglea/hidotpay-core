import assert from 'node:assert/strict';
import test from 'node:test';

import { RiskService } from '../../src/services/risk-service.js';
import { DomainError } from '../../src/domain/errors.js';

const now = new Date('2026-08-14T12:00:00.000Z');
const service = new RiskService({
  dailyLimitAtoms: '5000000',
  maxPerWithdrawalAtoms: '2000000',
  now: () => now,
  whitelistCooldownMs: 24 * 60 * 60 * 1000,
});

const request = {
  amountAtoms: '1000000', destinationAddress: '0x1111111111111111111111111111111111111111', feeQuote: { expiresAt: '2026-08-14T12:05:00.000Z', feeAtoms: '10000', id: 'fee-1' }, userId: 'user-1', usedTodayAtoms: '2000000', whitelistAddedAt: '2026-08-13T11:59:59.000Z',
};

test('risk service permits a valid fee quote and mature withdrawal whitelist', () => {
  assert.deepEqual(service.assessWithdrawal(request), { allowed: true, totalAtoms: '1010000' });
});

test('risk service blocks expired quotes, daily or per-withdrawal limit, immature whitelist, and flagged addresses', () => {
  assert.throws(
    () => service.assessWithdrawal({ ...request, feeQuote: { ...request.feeQuote, expiresAt: '2026-08-14T11:59:59.000Z' } }),
    (error: unknown) => error instanceof DomainError && error.code === 'fee_quote_expired',
  );
  assert.throws(
    () => service.assessWithdrawal({ ...request, amountAtoms: '2000001' }),
    (error: unknown) => error instanceof DomainError && error.code === 'withdrawal_limit_exceeded',
  );
  assert.throws(
    () => service.assessWithdrawal({ ...request, usedTodayAtoms: '4500000' }),
    (error: unknown) => error instanceof DomainError && error.code === 'daily_limit_exceeded',
  );
  assert.throws(
    () => service.assessWithdrawal({ ...request, whitelistAddedAt: '2026-08-14T11:59:59.000Z' }),
    (error: unknown) => error instanceof DomainError && error.code === 'withdrawal_whitelist_cooling_down',
  );
  assert.throws(
    () => service.assessWithdrawal({ ...request, destinationAddress: '0x0000000000000000000000000000000000000000' }),
    (error: unknown) => error instanceof DomainError && error.code === 'destination_address_blocked',
  );
});
