import type { AddressDeriver } from '../repositories/postgres-wallet-address-repository.js';
import { DomainError } from '../domain/errors.js';

type FetchImplementation = typeof fetch;

/**
 * The ledger API asks an isolated signer for a public address only. This
 * transport has no private-key, mnemonic, seed, or arbitrary-signing input.
 */
export class RemoteSignerAddressDeriver implements AddressDeriver {
  private readonly url: string;

  public constructor(private readonly config: {
    fetchImpl?: FetchImplementation;
    serviceToken: string;
    url: string;
  }) {
    let parsed: URL;
    try {
      parsed = new URL(config.url);
    } catch {
      throw new DomainError('signer_unavailable');
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) throw new DomainError('signer_unavailable');
    if (config.serviceToken.length < 16) throw new DomainError('signer_unavailable');
    this.url = parsed.toString();
  }

  public async deriveDepositAddress(input: { derivationIndex: number; keyVersion: number; network: string }): Promise<string> {
    if (!Number.isSafeInteger(input.derivationIndex) || input.derivationIndex < 0 || !Number.isSafeInteger(input.keyVersion) || input.keyVersion < 1) {
      throw new DomainError('signer_rejected');
    }
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(input.network)) throw new DomainError('invalid_network');
    let response: Response;
    try {
      response = await (this.config.fetchImpl ?? fetch)(this.url, {
        body: JSON.stringify({ derivation_index: input.derivationIndex, key_version: input.keyVersion, network: input.network }),
        headers: {
          authorization: `Bearer ${this.config.serviceToken}`,
          'content-type': 'application/json',
        },
        method: 'POST',
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new DomainError('signer_unavailable');
    }
    if (!response.ok) throw new DomainError('signer_rejected');
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new DomainError('signer_rejected');
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof (payload as { address?: unknown }).address !== 'string') {
      throw new DomainError('signer_rejected');
    }
    return (payload as { address: string }).address;
  }
}
