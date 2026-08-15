import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';

import { validateP2PPaymentMethod } from '../domain/p2p-payment-method.js';

export type P2PPaymentMethodCryptographer = { encrypt(plaintext: string): Promise<string> };
export type P2PPaymentMethodRecord = { accountHolderName: string; currency: string; id: string; maskedReference: string; methodCode: 'bank_transfer' | 'e_wallet'; ownerId: string; status: 'pending_review' | 'active' | 'rejected' | 'disabled' };

function mask(value: string): string { return `****${value.replace(/\s/g, '').slice(-4)}`; }

export class PostgresP2PPaymentMethodRepository {
  public constructor(private readonly pool: Pool, private readonly cryptographer: P2PPaymentMethodCryptographer) {}
  public async create(input: { accountHolderName: string; accountPayload: string; currency: string; methodCode: 'bank_transfer' | 'e_wallet'; ownerId: string }): Promise<P2PPaymentMethodRecord> {
    const maskedReference = mask(input.accountPayload);
    const publicFields = validateP2PPaymentMethod({ accountHolderName: input.accountHolderName, accountReference: maskedReference, currency: input.currency, methodCode: input.methodCode, ownerId: input.ownerId });
    const ciphertext = await this.cryptographer.encrypt(input.accountPayload);
    const result = await this.pool.query<{ id: string; status: P2PPaymentMethodRecord['status'] }>(
      `INSERT INTO p2p_payment_methods (id, owner_id, method_code, currency, account_holder_name, masked_reference, encrypted_payload, encryption_key_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'openbao-transit') RETURNING id, status`,
      [randomUUID(), publicFields.ownerId, publicFields.methodCode, publicFields.currency, publicFields.accountHolderName, publicFields.accountReference, ciphertext],
    );
    const row = result.rows[0]!;
    return { ...publicFields, id: row.id, maskedReference: publicFields.accountReference, status: row.status };
  }
  public async listForOwner(ownerId: string): Promise<P2PPaymentMethodRecord[]> {
    const result = await this.pool.query<{ account_holder_name: string; currency: string; id: string; masked_reference: string; method_code: P2PPaymentMethodRecord['methodCode']; owner_id: string; status: P2PPaymentMethodRecord['status'] }>(
      `SELECT id, owner_id, method_code, currency, account_holder_name, masked_reference, status FROM p2p_payment_methods WHERE owner_id = $1 ORDER BY created_at DESC`, [ownerId],
    );
    return result.rows.map((row) => ({ accountHolderName: row.account_holder_name, currency: row.currency, id: row.id, maskedReference: row.masked_reference, methodCode: row.method_code, ownerId: row.owner_id, status: row.status }));
  }
}
