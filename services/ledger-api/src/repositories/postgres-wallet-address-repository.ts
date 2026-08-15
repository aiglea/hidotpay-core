import { randomUUID } from 'node:crypto';

import type { Pool, PoolClient } from 'pg';

import { DomainError } from '../domain/errors.js';

export type WalletAddress = {
  accountId: string;
  address: string;
  derivationIndex: number;
  id: string;
  keyVersion: number;
  network: string;
  ownerId: string;
};

export interface AddressDeriver {
  deriveDepositAddress(input: { derivationIndex: number; keyVersion: number; network: string }): Promise<string>;
}

type AllocationInput = { accountId: string; network: string; ownerId: string };

function isRetryable(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  return code === '40001';
}

export class PostgresWalletAddressRepository {
  public constructor(private readonly pool: Pool, private readonly deriver: AddressDeriver) {}

  public async allocate(input: AllocationInput): Promise<WalletAddress> {
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(input.network)) throw new DomainError('invalid_network');
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
        const value = await this.allocateInTransaction(client, input);
        await client.query('COMMIT');
        return value;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        if (attempt < 3 && isRetryable(error)) continue;
        throw error;
      } finally {
        client.release();
      }
    }
    throw new Error('wallet address allocation retry limit exhausted');
  }

  private async allocateInTransaction(client: PoolClient, input: AllocationInput): Promise<WalletAddress> {
    const existing = await client.query<WalletAddressRow>(
      `SELECT id, owner_id, account_id, network, key_version, derivation_index, address
       FROM wallet_addresses WHERE owner_id = $1 AND network = $2 FOR UPDATE`,
      [input.ownerId, input.network],
    );
    if (existing.rowCount === 1 && existing.rows[0]) return mapAddress(existing.rows[0]);

    const account = await client.query<{ account_kind: string; owner_id: string; status: string }>(
      'SELECT owner_id, account_kind, status FROM accounts WHERE id = $1 FOR UPDATE',
      [input.accountId],
    );
    const accountRow = account.rows[0];
    if (!accountRow || accountRow.owner_id !== input.ownerId) throw new DomainError('account_not_owned');
    if (accountRow.account_kind !== 'user_available' || accountRow.status !== 'active') throw new DomainError('account_unavailable');

    const key = await client.query<{ key_version: string }>(
      `SELECT key_version::STRING FROM wallet_key_versions
       WHERE status = 'active' ORDER BY key_version DESC LIMIT 1 FOR UPDATE`,
    );
    const keyVersion = Number(key.rows[0]?.key_version);
    if (!Number.isSafeInteger(keyVersion) || keyVersion < 1) throw new DomainError('signer_key_not_configured');

    const counter = await client.query<{ next_index: string }>(
      `INSERT INTO wallet_derivation_counters (network, next_index)
       VALUES ($1, 1)
       ON CONFLICT (network) DO UPDATE
       SET next_index = wallet_derivation_counters.next_index + 1, updated_at = now()
       RETURNING next_index::STRING`,
      [input.network],
    );
    const derivationIndex = Number(counter.rows[0]?.next_index) - 1;
    if (!Number.isSafeInteger(derivationIndex) || derivationIndex < 0) throw new Error('invalid derivation counter');
    const address = await this.deriver.deriveDepositAddress({ derivationIndex, keyVersion, network: input.network });
    if (!/^[A-Za-z0-9:_-]{8,200}$/.test(address)) throw new DomainError('signer_returned_invalid_address');

    const result = await client.query<WalletAddressRow>(
      `INSERT INTO wallet_addresses (id, owner_id, account_id, network, key_version, derivation_index, address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, owner_id, account_id, network, key_version, derivation_index, address`,
      [randomUUID(), input.ownerId, input.accountId, input.network, keyVersion, derivationIndex, address],
    );
    const row = result.rows[0];
    if (!row) throw new Error('wallet address insert returned no row');
    return mapAddress(row);
  }
}

type WalletAddressRow = {
  account_id: string;
  address: string;
  derivation_index: string;
  id: string;
  key_version: string;
  network: string;
  owner_id: string;
};

function mapAddress(row: WalletAddressRow): WalletAddress {
  return {
    accountId: row.account_id,
    address: row.address,
    derivationIndex: Number(row.derivation_index),
    id: row.id,
    keyVersion: Number(row.key_version),
    network: row.network,
    ownerId: row.owner_id,
  };
}
