import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';

import { validateP2PAd, type P2PAd } from '../domain/p2p-ad.js';

export type P2PAdRecord = P2PAd & { id: string; status: 'active' | 'closed' | 'paused' };

export class PostgresP2PAdRepository {
  public constructor(private readonly pool: Pool) {}

  public async create(input: P2PAd): Promise<P2PAdRecord> {
    const ad = validateP2PAd(input);
    const id = randomUUID();
    const result = await this.pool.query<{
      asset_code: string; fiat_currency: string; id: string; max_amount_atoms: string; min_amount_atoms: string; payment_method_code: string; price_atoms: string; seller_id: string; status: P2PAdRecord['status'];
    }>(
      `INSERT INTO p2p_ads (id, seller_id, asset_code, fiat_currency, price_atoms, min_amount_atoms, max_amount_atoms, payment_method_code)
       VALUES ($1, $2, $3, $4, $5::DECIMAL, $6::DECIMAL, $7::DECIMAL, $8)
       RETURNING id, seller_id, asset_code, fiat_currency, price_atoms::STRING, min_amount_atoms::STRING, max_amount_atoms::STRING, payment_method_code, status`,
      [id, ad.sellerId, ad.assetCode, ad.fiatCurrency, ad.priceAtoms, ad.minAmountAtoms, ad.maxAmountAtoms, ad.paymentMethodCode],
    );
    const row = result.rows[0]!;
    return { assetCode: row.asset_code, fiatCurrency: row.fiat_currency, id: row.id, maxAmountAtoms: row.max_amount_atoms, minAmountAtoms: row.min_amount_atoms, paymentMethodCode: row.payment_method_code, priceAtoms: row.price_atoms, sellerId: row.seller_id, status: row.status };
  }

  public async listActive(): Promise<P2PAdRecord[]> {
    const result = await this.pool.query<{
      asset_code: string; fiat_currency: string; id: string; max_amount_atoms: string; min_amount_atoms: string; payment_method_code: string; price_atoms: string; seller_id: string; status: P2PAdRecord['status'];
    }>(
      `SELECT id, seller_id, asset_code, fiat_currency, price_atoms::STRING, min_amount_atoms::STRING, max_amount_atoms::STRING, payment_method_code, status
       FROM p2p_ads WHERE status = 'active' ORDER BY created_at DESC LIMIT 100`,
    );
    return result.rows.map((row) => ({ assetCode: row.asset_code, fiatCurrency: row.fiat_currency, id: row.id, maxAmountAtoms: row.max_amount_atoms, minAmountAtoms: row.min_amount_atoms, paymentMethodCode: row.payment_method_code, priceAtoms: row.price_atoms, sellerId: row.seller_id, status: row.status }));
  }
}
