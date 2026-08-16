import { httpsEndpoint, readJson, runtimeFetch, timeoutInit, type Fetch } from './https-endpoint.js';

type TransferQuery = { contractIdentifier: string; fromBlock: number; toBlock: number; watchedAddresses: string[] };
type RpcTransfer = { amountAtoms: string; blockHash: string; blockHeight: number; contractIdentifier: string; destinationAddress: string; logIndex: number; transactionHash: string };

const address = /^[a-z0-9]{20,90}$/i;

export class BitcoinExplorerProvider {
  private readonly endpoint: URL;
  private readonly fetcher: Fetch;

  public constructor(config: { fetch?: Fetch; url: string }) {
    this.endpoint = httpsEndpoint(config.url);
    this.fetcher = runtimeFetch(config.fetch);
  }

  public async getHead(): Promise<number> {
    const response = await this.fetcher(new URL('blocks/tip/height', `${this.endpoint.toString().replace(/\/?$/, '/')}`).toString(), timeoutInit());
    if (!response.ok) throw new Error('Bitcoin explorer request failed');
    const height = Number((await response.text()).trim());
    if (!Number.isSafeInteger(height) || height < 0) throw new Error('Bitcoin explorer returned invalid height');
    return height;
  }

  public async getBlockHash(height: number): Promise<string> {
    if (!Number.isSafeInteger(height) || height < 0) throw new Error('invalid Bitcoin height');
    const response = await this.fetcher(new URL(`block-height/${height}`, `${this.endpoint.toString().replace(/\/?$/, '/')}`).toString(), timeoutInit());
    if (!response.ok) throw new Error('Bitcoin explorer request failed');
    const hash = (await response.text()).trim();
    if (!/^[0-9a-f]{8,128}$/i.test(hash)) throw new Error('Bitcoin explorer returned invalid block hash');
    return hash;
  }

  public async listTokenTransfers(query: TransferQuery): Promise<RpcTransfer[]> {
    if (query.contractIdentifier !== 'native:btc' || !Number.isSafeInteger(query.fromBlock) || !Number.isSafeInteger(query.toBlock) || query.fromBlock < 0 || query.toBlock < query.fromBlock) {
      throw new Error('invalid Bitcoin transfer query');
    }
    const result: RpcTransfer[] = [];
    for (const destinationAddress of query.watchedAddresses) {
      if (!address.test(destinationAddress)) throw new Error('invalid watched Bitcoin address');
      const response = await this.fetcher(new URL(`address/${destinationAddress}/txs`, `${this.endpoint.toString().replace(/\/?$/, '/')}`).toString(), timeoutInit());
      const payload = await readJson(response);
      if (!Array.isArray(payload)) throw new Error('Bitcoin explorer returned invalid transactions');
      for (const item of payload) {
        if (!item || typeof item !== 'object') throw new Error('Bitcoin explorer returned invalid transaction');
        const row = item as { status?: { block_hash?: unknown; block_height?: unknown; confirmed?: unknown }; txid?: unknown; vout?: unknown };
        if (typeof row.txid !== 'string' || !row.status || typeof row.status !== 'object' || !Array.isArray(row.vout)) continue;
        if (row.status.confirmed !== true || typeof row.status.block_height !== 'number' || typeof row.status.block_hash !== 'string') continue;
        if (row.status.block_height < query.fromBlock || row.status.block_height > query.toBlock) continue;
        row.vout.forEach((output, logIndex) => {
          if (!output || typeof output !== 'object') return;
          const out = output as { scriptpubkey_address?: unknown; value?: unknown };
          if (out.scriptpubkey_address !== destinationAddress || typeof out.value !== 'number' || !Number.isSafeInteger(out.value) || out.value <= 0) return;
          result.push({
            amountAtoms: String(out.value),
            blockHash: row.status!.block_hash as string,
            blockHeight: row.status!.block_height as number,
            contractIdentifier: 'native:btc',
            destinationAddress,
            logIndex,
            transactionHash: row.txid as string,
          });
        });
      }
    }
    return result;
  }
}
