import type { DepositCreditor, DepositObservation } from './scanner.js';

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export class LedgerDepositCreditor implements DepositCreditor {
  private readonly endpoint: URL;
  private readonly fetcher: Fetch;

  public constructor(private readonly config: { bearerToken: string; fetch?: Fetch; url: string }) {
    this.endpoint = new URL(config.url);
    if (this.endpoint.protocol !== 'https:' || this.endpoint.username || this.endpoint.password || this.endpoint.hash) throw new Error('ledger deposit endpoint must be private HTTPS');
    if (config.bearerToken.length < 16) throw new Error('ledger chain worker token is invalid');
    this.fetcher = config.fetch ?? fetch;
  }

  public async credit(observation: DepositObservation): Promise<void> {
    const response = await this.fetcher(new URL('/v1/deposits/confirmed', this.endpoint), {
      body: JSON.stringify({
        amount_atoms: observation.amountAtoms,
        asset_code: observation.assetCode,
        block_hash: observation.blockHash,
        block_height: String(observation.blockHeight),
        confirmation_count: observation.confirmationCount,
        contract_identifier: observation.contractIdentifier,
        destination_account_id: observation.accountId,
        network: observation.network,
        output_index: observation.eventIndex,
        transaction_hash: observation.transactionHash,
      }),
      headers: { authorization: `Bearer ${this.config.bearerToken}`, 'content-type': 'application/json' },
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('ledger deposit credit failed');
  }
}
