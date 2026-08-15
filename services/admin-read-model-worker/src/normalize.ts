import type { ProjectionName, ProjectionRecord } from './contracts.js';

const fieldsByProjection: Record<ProjectionName, readonly string[]> = {
  wallet_addresses: ['address', 'network', 'status'],
  deposit_receipts: ['amount_atoms', 'asset_code', 'blnk_status', 'confirmation_count', 'network', 'transaction_hash'],
  withdrawal_requests: ['amount_atoms', 'asset_code', 'destination_address', 'fee_atoms', 'network', 'status'],
  ledger_transactions: ['actor_id', 'status', 'transaction_type'],
  withdrawal_risk_decisions: ['decision', 'rule_code', 'withdrawal_id'],
};

function valueAsString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.valueOf())) throw new Error(`invalid ${field} projection field`);
    return value.toISOString();
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  throw new Error(`invalid ${field} projection field`);
}

function requiredString(row: Record<string, unknown>, field: string): string {
  const value = valueAsString(row[field], field);
  if (!value) throw new Error(`missing ${field} projection field`);
  return value;
}

export function normalizeProjectionRows(name: ProjectionName, rows: Record<string, unknown>[]): ProjectionRecord[] {
  return rows.map((row) => {
    const sourceUpdatedAt = requiredString(row, name === 'wallet_addresses' ? 'created_at' : 'updated_at');
    const record: ProjectionRecord = {
      source_id: requiredString(row, 'id'),
      source_updated_at: sourceUpdatedAt,
    };
    for (const field of fieldsByProjection[name]) record[field] = valueAsString(row[field], field);
    return record;
  });
}
