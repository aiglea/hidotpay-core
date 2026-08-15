import type { AddressDeriver } from '../repositories/postgres-wallet-address-repository.js';

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
      throw new Error('private signer URL is invalid');
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) throw new Error('private signer URL must use https without credentials or fragments');
    if (config.serviceToken.length < 16) throw new Error('private signer service credential is invalid');
    this.url = parsed.toString();
  }

  public async deriveDepositAddress(input: { derivationIndex: number; keyVersion: number; network: string }): Promise<string> {
    if (!Number.isSafeInteger(input.derivationIndex) || input.derivationIndex < 0 || !Number.isSafeInteger(input.keyVersion) || input.keyVersion < 1) {
      throw new Error('signer address request is invalid');
    }
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(input.network)) throw new Error('signer address network is invalid');
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
      throw new Error('private signer is unavailable');
    }
    if (!response.ok) throw new Error(`private signer returned HTTP ${response.status}`);
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error('signer response is invalid');
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof (payload as { address?: unknown }).address !== 'string') {
      throw new Error('signer response is invalid');
    }
    return (payload as { address: string }).address;
  }
}
