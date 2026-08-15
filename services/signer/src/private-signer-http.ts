import { timingSafeEqual } from 'node:crypto';

import { DepositAddressService } from './deposit-address-service.js';
import { SignerPolicy } from './signer-policy.js';

export type PrivateSignerHttpRequest = {
  authorization?: string;
  body: string;
  method: string;
  path: string;
};

export type PrivateSignerHttpResponse = {
  body: string;
  headers: Record<string, string>;
  statusCode: number;
};

/**
 * Deliberately small, private-only HTTP boundary for the signer. The caller
 * identity comes from the deployed service credential, never the JSON body.
 * This handler does not hold a key: the injected backends must be HSM or
 * Web3Signer backed in a deployed environment.
 */
export class PrivateSignerHttpHandler {
  private readonly serviceToken: Buffer;

  public constructor(private readonly config: {
    addressService: DepositAddressService;
    serviceToken: string;
    signingPolicy: SignerPolicy;
  }) {
    if (config.serviceToken.length < 16) throw new Error('private signer service credential is invalid');
    this.serviceToken = Buffer.from(config.serviceToken);
  }

  public async handle(request: PrivateSignerHttpRequest): Promise<PrivateSignerHttpResponse> {
    if (!this.isAuthorized(request.authorization)) return this.respond(401, { error: 'unauthorized' });
    if (request.method !== 'POST') return this.respond(405, { error: 'method_not_allowed' });
    if (request.body.length > 16_384) return this.respond(413, { error: 'request_too_large' });

    try {
      if (request.path === '/v1/deposit-addresses') return await this.deriveAddress(request.body);
      if (request.path === '/v1/withdrawals/sign') return await this.signWithdrawal(request.body);
      return this.respond(404, { error: 'not_found' });
    } catch {
      // Do not echo backend errors, payloads, addresses, or key references.
      return this.respond(400, { error: 'invalid_request' });
    }
  }

  private async deriveAddress(body: string): Promise<PrivateSignerHttpResponse> {
    const input = asExactObject(body, ['derivation_index', 'key_version', 'network']);
    const result = await this.config.addressService.deriveDepositAddress({
      caller: 'wallet-address-service',
      derivationIndex: asSafeInteger(input.derivation_index),
      keyVersion: asSafeInteger(input.key_version),
      network: asString(input.network),
    });
    return this.respond(200, { address: result.address, key_version: result.keyVersion, network: result.network });
  }

  private async signWithdrawal(body: string): Promise<PrivateSignerHttpResponse> {
    const input = asExactObject(body, [
      'amount_atoms', 'asset_code', 'derivation_index', 'destination_address',
      'key_version', 'network', 'payload_hash', 'withdrawal_id',
    ]);
    const result = await this.config.signingPolicy.signWithdrawal({
      amountAtoms: asString(input.amount_atoms),
      assetCode: asString(input.asset_code),
      caller: 'withdrawal-worker',
      derivationIndex: asSafeInteger(input.derivation_index),
      destinationAddress: asString(input.destination_address),
      keyVersion: asSafeInteger(input.key_version),
      network: asString(input.network),
      payloadHash: asString(input.payload_hash),
      withdrawalId: asString(input.withdrawal_id),
    });
    return this.respond(200, { audit_id: result.auditId, key_version: result.keyVersion, signature: result.signature });
  }

  private isAuthorized(authorization: string | undefined): boolean {
    if (!authorization?.startsWith('Bearer ')) return false;
    const supplied = Buffer.from(authorization.slice('Bearer '.length));
    return supplied.length === this.serviceToken.length && timingSafeEqual(supplied, this.serviceToken);
  }

  private respond(statusCode: number, payload: Record<string, string | number>): PrivateSignerHttpResponse {
    return { body: JSON.stringify(payload), headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, statusCode };
  }
}

function asExactObject(body: string, allowedKeys: string[]): Record<string, unknown> {
  const parsed: unknown = JSON.parse(body);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('body must be an object');
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== allowedKeys.length || keys.some((key) => !allowedKeys.includes(key))) throw new Error('unexpected request fields');
  return record;
}

function asSafeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error('integer field is invalid');
  return value;
}

function asString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1_024) throw new Error('string field is invalid');
  return value;
}
