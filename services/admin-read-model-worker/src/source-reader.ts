import type { ProjectionName } from './contracts.js';
import type { AdminProjectionSource } from './projector.js';

type QueryClient = {
  query: (sql: string) => Promise<{ rows: Record<string, unknown>[] }>;
};

const queries: Record<ProjectionName, string> = {
  wallet_addresses: 'SELECT id, address, network, status, created_at FROM admin_wallet_addresses',
  deposit_receipts: 'SELECT id, amount_atoms, asset_code, blnk_status, confirmation_count, network, transaction_hash, created_at AS updated_at FROM admin_deposit_receipts',
  withdrawal_requests: 'SELECT id, amount_atoms, asset_code, destination_address, fee_atoms, network, status, updated_at FROM admin_withdrawal_requests',
  ledger_transactions: 'SELECT id, actor_id, status, transaction_type, created_at AS updated_at FROM admin_ledger_transactions',
  withdrawal_risk_decisions: 'SELECT id, decision, rule_code, withdrawal_id, created_at AS updated_at FROM admin_withdrawal_risk_decisions',
};

export class PostgresAdminProjectionSource implements AdminProjectionSource {
  constructor(private readonly client: QueryClient) {}

  async list(name: ProjectionName): Promise<Record<string, unknown>[]> {
    return (await this.client.query(queries[name])).rows;
  }
}
