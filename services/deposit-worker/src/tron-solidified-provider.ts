import type { ChainTransfer, TransferQuery } from './scanner.js';

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>;
type RawEvent = { block_number?: unknown; contract_address?: unknown; event_index?: unknown; event_name?: unknown; result?: unknown; transaction_id?: unknown };
const hash = /^[a-fA-F0-9]{64}$/;

/** TRON read-only provider: credits are based on Solidity-node (solidified) blocks and confirmed Transfer events only. */
export class TronSolidifiedProvider {
  private readonly endpoint: URL;
  private readonly fetcher: Fetch;

  public constructor(private readonly config: { apiKey: string; fetch?: Fetch; url: string }) {
    this.endpoint = new URL(config.url);
    if (this.endpoint.protocol !== 'https:' || this.endpoint.username || this.endpoint.password || this.endpoint.hash) throw new Error('TRON endpoint must be private HTTPS');
    if (config.apiKey.length < 16) throw new Error('TRON API key is invalid');
    this.fetcher = config.fetch ?? fetch;
  }

  public async getHead(): Promise<number> {
    const result = await this.post('/walletsolidity/getnowblock', {});
    return this.height(result && typeof result === 'object' ? (result as { block_header?: { raw_data?: { number?: unknown } } }).block_header?.raw_data?.number : undefined);
  }

  public async getBlockHash(height: number): Promise<string> {
    const result = await this.post('/walletsolidity/getblockbynum', { num: height });
    const blockId = result && typeof result === 'object' ? (result as { blockID?: unknown }).blockID : undefined;
    if (typeof blockId !== 'string' || !hash.test(blockId)) throw new Error('TRON node returned invalid solidified block');
    return blockId;
  }

  public async listTokenTransfers(query: TransferQuery): Promise<Array<Omit<ChainTransfer, 'eventIndex' | 'network'> & { eventIndex: number }>> {
    if (!Number.isSafeInteger(query.fromBlock) || !Number.isSafeInteger(query.toBlock) || query.fromBlock < 0 || query.toBlock < query.fromBlock) throw new Error('TRON transfer query is invalid');
    const values: Array<Omit<ChainTransfer, 'eventIndex' | 'network'> & { eventIndex: number }> = [];
    for (let height = query.fromBlock; height <= query.toBlock; height += 1) {
      const blockHash = await this.getBlockHash(height);
      let fingerprint: string | undefined;
      do {
        const url = new URL(`/v1/contracts/${encodeURIComponent(query.contractIdentifier)}/events`, this.endpoint);
        url.searchParams.set('event_name', 'Transfer');
        url.searchParams.set('block_number', String(height));
        url.searchParams.set('only_confirmed', 'true');
        url.searchParams.set('limit', '200');
        if (fingerprint) url.searchParams.set('fingerprint', fingerprint);
        const result = await this.get(url);
        const page = result as { data?: unknown; meta?: { fingerprint?: unknown } };
        if (!Array.isArray(page.data)) throw new Error('TRON event indexer returned invalid events');
        for (const event of page.data) {
          const transfer = this.decodeEvent(event as RawEvent, query.contractIdentifier, height, blockHash);
          if (query.watchedAddresses.includes(transfer.destinationAddress)) values.push(transfer);
        }
        fingerprint = typeof page.meta?.fingerprint === 'string' && page.data.length === 200 ? page.meta.fingerprint : undefined;
      } while (fingerprint);
    }
    return values;
  }

  private decodeEvent(event: RawEvent, contractIdentifier: string, expectedHeight: number, blockHash: string): Omit<ChainTransfer, 'eventIndex' | 'network'> & { eventIndex: number } {
    const result = event.result && typeof event.result === 'object' ? event.result as { to?: unknown; value?: unknown } : undefined;
    if (event.event_name !== 'Transfer' || event.contract_address !== contractIdentifier || this.height(event.block_number) !== expectedHeight || typeof event.event_index !== 'number' || !Number.isSafeInteger(event.event_index) || event.event_index < 0 || typeof event.transaction_id !== 'string' || !hash.test(event.transaction_id) || typeof result?.to !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{30,50}$/.test(result.to) || (typeof result.value !== 'string' && typeof result.value !== 'number') || !/^[1-9][0-9]*$/.test(String(result.value))) throw new Error('TRON event indexer returned invalid Transfer');
    return { amountAtoms: String(result.value), blockHash, blockHeight: expectedHeight, contractIdentifier, destinationAddress: result.to, eventIndex: event.event_index, transactionHash: event.transaction_id };
  }

  private height(value: unknown): number {
    const numeric = typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : typeof value === 'number' ? value : Number.NaN;
    if (!Number.isSafeInteger(numeric) || numeric < 0) throw new Error('TRON node returned invalid block height');
    return numeric;
  }

  private async post(path: string, body: unknown): Promise<unknown> { return this.request(new URL(path, this.endpoint), { body: JSON.stringify(body), method: 'POST' }); }
  private async get(url: URL): Promise<unknown> { return this.request(url, { method: 'GET' }); }
  private async request(url: URL, init: RequestInit): Promise<unknown> {
    const response = await this.fetcher(url, { ...init, headers: { 'content-type': 'application/json', 'TRON-PRO-API-KEY': this.config.apiKey }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('TRON request failed');
    return response.json();
  }
}
