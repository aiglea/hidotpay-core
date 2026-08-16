import { httpsEndpoint, readJson, runtimeFetch, timeoutInit, type Fetch } from './https-endpoint.js';

type TransferQuery = { contractIdentifier: string; fromBlock: number; toBlock: number; watchedAddresses: string[] };
type RpcTransfer = { amountAtoms: string; blockHash: string; blockHeight: number; contractIdentifier: string; destinationAddress: string; logIndex: number; transactionHash: string };

export class StellarHorizonProvider {
  private readonly endpoint: URL;
  private readonly fetcher: Fetch;

  public constructor(config: { fetch?: Fetch; url: string }) {
    this.endpoint = httpsEndpoint(config.url);
    this.fetcher = runtimeFetch(config.fetch);
  }

  public async getHead(): Promise<number> {
    const payload = await this.get(new URL('ledgers?order=desc&limit=1', `${this.base()}`));
    const sequence = firstRecord(payload)?.sequence;
    if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < 1) throw new Error('Stellar Horizon returned invalid ledger');
    return sequence;
  }

  public async getBlockHash(height: number): Promise<string> {
    if (!Number.isSafeInteger(height) || height < 1) throw new Error('invalid Stellar ledger');
    const payload = await this.get(new URL(`ledgers/${height}`, `${this.base()}`));
    const hash = payload && typeof payload === 'object' ? (payload as { hash?: unknown }).hash : undefined;
    if (typeof hash !== 'string' || hash.length < 8) throw new Error('Stellar Horizon returned invalid ledger hash');
    return hash;
  }

  public async listTokenTransfers(query: TransferQuery): Promise<RpcTransfer[]> {
    const asset = parseStellarAsset(query.contractIdentifier);
    if (!asset || !Number.isSafeInteger(query.fromBlock) || !Number.isSafeInteger(query.toBlock) || query.fromBlock < 1 || query.toBlock < query.fromBlock) {
      throw new Error('invalid Stellar transfer query');
    }
    const result: RpcTransfer[] = [];
    for (const destinationAddress of query.watchedAddresses) {
      if (!/^G[A-Z2-7]{55}$/.test(destinationAddress)) throw new Error('invalid watched Stellar address');
      const payload = await this.get(new URL(`accounts/${destinationAddress}/payments?limit=200&order=desc`, `${this.base()}`));
      const records = embeddedRecords(payload);
      for (const item of records) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        if (row.type !== 'payment' || row.to !== destinationAddress || row.asset_code !== asset.code || row.asset_issuer !== asset.issuer) continue;
        if (typeof row.ledger !== 'number' || row.ledger < query.fromBlock || row.ledger > query.toBlock) continue;
        if (typeof row.amount !== 'string' || typeof row.transaction_hash !== 'string') continue;
        const amountAtoms = stellarAmountToAtoms(row.amount, 6);
        if (!amountAtoms) continue;
        result.push({
          amountAtoms,
          blockHash: await this.getBlockHash(row.ledger),
          blockHeight: row.ledger,
          contractIdentifier: query.contractIdentifier,
          destinationAddress,
          logIndex: 0,
          transactionHash: row.transaction_hash,
        });
      }
    }
    return result;
  }

  private base(): string {
    return `${this.endpoint.toString().replace(/\/?$/, '/')}`;
  }

  private async get(url: URL): Promise<unknown> {
    return readJson(await this.fetcher(url.toString(), timeoutInit()));
  }
}

function firstRecord(payload: unknown): { sequence?: unknown } | undefined {
  return embeddedRecords(payload)[0];
}

function embeddedRecords(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== 'object') return [];
  const records = (payload as { _embedded?: { records?: unknown } })._embedded?.records;
  return Array.isArray(records) ? records.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object') : [];
}

function parseStellarAsset(identifier: string): { code: string; issuer: string } | undefined {
  const match = /^([A-Z0-9]{1,12}):(G[A-Z2-7]{55})$/.exec(identifier);
  return match ? { code: match[1]!, issuer: match[2]! } : undefined;
}

function stellarAmountToAtoms(amount: string, decimals: number): string | undefined {
  if (!/^\d+(\.\d{1,7})?$/.test(amount)) return undefined;
  const [whole, fraction = ''] = amount.split('.');
  const atoms = BigInt(whole ?? '0') * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0').slice(0, decimals));
  return atoms > 0n ? atoms.toString() : undefined;
}
