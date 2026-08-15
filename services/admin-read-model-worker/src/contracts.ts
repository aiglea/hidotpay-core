export const projectionNames = [
  'wallet_addresses',
  'deposit_receipts',
  'withdrawal_requests',
  'ledger_transactions',
  'withdrawal_risk_decisions',
] as const;

export type ProjectionName = (typeof projectionNames)[number];
export type ProjectionRecord = { source_id: string; source_updated_at: string } & Record<string, string | null>;
