import { DomainError } from './errors.js';

export type WalletTransactionCursor = {
  createdAt: string;
  id: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeWalletTransactionCursor(value: WalletTransactionCursor): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeWalletTransactionCursor(cursor: string): WalletTransactionCursor {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('cursor is not base64url');
    const decoded = Buffer.from(cursor, 'base64url');
    if (decoded.toString('base64url') !== cursor) throw new Error('cursor is not canonical base64url');
    const value: unknown = JSON.parse(decoded.toString('utf8'));
    if (!isWalletTransactionCursor(value)) throw new Error('cursor payload is invalid');
    return value;
  } catch {
    throw new DomainError('invalid_wallet_transaction_cursor');
  }
}

function isWalletTransactionCursor(value: unknown): value is WalletTransactionCursor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (entries.length !== 2 || !Object.hasOwn(value, 'createdAt') || !Object.hasOwn(value, 'id')) return false;
  const { createdAt, id } = value as Record<string, unknown>;
  if (typeof createdAt !== 'string' || typeof id !== 'string' || !uuidPattern.test(id)) return false;
  const date = new Date(createdAt);
  return !Number.isNaN(date.valueOf()) && date.toISOString() === createdAt;
}
