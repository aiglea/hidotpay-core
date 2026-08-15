import type { DepositTarget } from './scanner.js';

type Queryable = { query<T extends Record<string, unknown>>(sql: string, values: unknown[]): Promise<{ rows: T[] }> };
export type DepositAssetPolicy = { assetCode: string; contractIdentifier: string; minimumConfirmations: number };

/** Database is the allow-list: no address or asset exists here unless it was explicitly registered by the wallet service. */
export class PostgresDepositCatalog {
  public constructor(private readonly pool: Queryable) {}

  public async targets(network: string): Promise<DepositTarget[]> {
    const result = await this.pool.query<{ account_id: string; address: string; asset_code: string }>(
      `SELECT wa.account_id::STRING AS account_id, wa.address, ca.asset_code
       FROM wallet_addresses wa
       JOIN accounts account ON account.id = wa.account_id
       JOIN chain_assets ca ON ca.network = wa.network AND ca.enabled = true
       JOIN chain_networks cn ON cn.network = wa.network AND cn.enabled = true
       JOIN assets asset ON asset.code = ca.asset_code AND asset.enabled = true
       WHERE wa.network = $1 AND wa.status = 'active' AND account.account_kind = 'user_available' AND account.status = 'active'
       ORDER BY wa.created_at ASC, ca.asset_code ASC`,
      [network],
    );
    return result.rows.map((row) => ({ accountId: row.account_id, address: row.address, assetCode: row.asset_code }));
  }

  public async policies(network: string): Promise<DepositAssetPolicy[]> {
    const result = await this.pool.query<{ asset_code: string; contract_identifier: string; minimum_confirmations: string }>(
      `SELECT ca.asset_code, ca.contract_identifier, ca.minimum_confirmations::STRING AS minimum_confirmations
       FROM chain_assets ca
       JOIN chain_networks cn ON cn.network = ca.network AND cn.enabled = true
       JOIN assets asset ON asset.code = ca.asset_code AND asset.enabled = true
       WHERE ca.network = $1 AND ca.enabled = true ORDER BY ca.asset_code ASC`,
      [network],
    );
    return result.rows.map((row) => {
      const minimumConfirmations = Number(row.minimum_confirmations);
      if (!Number.isSafeInteger(minimumConfirmations) || minimumConfirmations < 1) throw new Error('database chain asset policy is invalid');
      return { assetCode: row.asset_code, contractIdentifier: row.contract_identifier, minimumConfirmations };
    });
  }
}
