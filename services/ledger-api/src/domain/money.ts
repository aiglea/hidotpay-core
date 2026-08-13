import { DomainError } from './errors.js';

export function parsePositiveAtoms(value: string): bigint {
  if (!/^[1-9][0-9]*$/.test(value)) throw new DomainError('invalid_amount');
  return BigInt(value);
}

export function parseNonNegativeAtoms(value: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new DomainError('invalid_amount');
  return BigInt(value);
}
