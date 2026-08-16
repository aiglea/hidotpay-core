import { httpsEndpoint, runtimeFetch, timeoutInit, type Fetch } from './https-endpoint.js';

type TransferQuery = { contractIdentifier: string; fromBlock: number; toBlock: number; watchedAddresses: string[] };
type RpcTransfer = { amountAtoms: string; blockHash: string; blockHeight: number; contractIdentifier: string; destinationAddress: string; logIndex: number; transactionHash: string };

type TokenBalance = { mint?: unknown; owner?: unknown; uiTokenAmount?: { amount?: unknown } };

export class SolanaJsonRpcProvider {
  private readonly endpoint: URL;
  private readonly fetcher: Fetch;

  public constructor(config: { fetch?: Fetch; url: string }) {
    this.endpoint = httpsEndpoint(config.url);
    this.fetcher = runtimeFetch(config.fetch);
  }

  public async getHead(): Promise<number> {
    const slot = await this.call('getSlot', []);
    if (typeof slot !== 'number' || !Number.isSafeInteger(slot) || slot < 0) throw new Error('Solana RPC returned invalid slot');
    return slot;
  }

  public async getBlockHash(height: number): Promise<string> {
    if (!Number.isSafeInteger(height) || height < 0) throw new Error('invalid Solana slot');
    const block = await this.call('getBlock', [height, { maxSupportedTransactionVersion: 0, transactionDetails: 'none' }]);
    const hash = block && typeof block === 'object' ? (block as { blockhash?: unknown }).blockhash : undefined;
    if (typeof hash !== 'string' || hash.length < 8) throw new Error('Solana RPC returned invalid blockhash');
    return hash;
  }

  public async listTokenTransfers(query: TransferQuery): Promise<RpcTransfer[]> {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(query.contractIdentifier) || !Number.isSafeInteger(query.fromBlock) || !Number.isSafeInteger(query.toBlock) || query.fromBlock < 0 || query.toBlock < query.fromBlock) {
      throw new Error('invalid Solana transfer query');
    }
    const result: RpcTransfer[] = [];
    for (const destinationAddress of query.watchedAddresses) {
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(destinationAddress)) throw new Error('invalid watched Solana address');
      const signatures = await this.call('getSignaturesForAddress', [destinationAddress, { limit: 100 }]);
      if (!Array.isArray(signatures)) throw new Error('Solana RPC returned invalid signatures');
      for (const item of signatures) {
        const signature = item && typeof item === 'object' ? (item as { signature?: unknown }).signature : undefined;
        if (typeof signature !== 'string') continue;
        const tx = await this.call('getTransaction', [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]);
        if (!tx || typeof tx !== 'object') continue;
        const row = tx as { meta?: { postTokenBalances?: TokenBalance[]; preTokenBalances?: TokenBalance[] }; slot?: unknown; transaction?: { signatures?: unknown } };
        if (typeof row.slot !== 'number' || row.slot < query.fromBlock || row.slot > query.toBlock) continue;
        const amountAtoms = tokenDelta(row.meta?.preTokenBalances ?? [], row.meta?.postTokenBalances ?? [], destinationAddress, query.contractIdentifier);
        if (!amountAtoms) continue;
        result.push({
          amountAtoms,
          blockHash: await this.getBlockHash(row.slot),
          blockHeight: row.slot,
          contractIdentifier: query.contractIdentifier,
          destinationAddress,
          logIndex: 0,
          transactionHash: signature,
        });
      }
    }
    return result;
  }

  private async call(method: string, params: unknown[]): Promise<unknown> {
    const response = await this.fetcher(this.endpoint.toString(), timeoutInit({
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }));
    if (!response.ok) throw new Error('Solana RPC request failed');
    const payload = await response.json() as { error?: unknown; result?: unknown };
    if (payload.error || payload.result === undefined) throw new Error('Solana RPC returned an error');
    return payload.result;
  }
}

function tokenDelta(pre: TokenBalance[], post: TokenBalance[], owner: string, mint: string): string | undefined {
  const before = atomsFor(pre, owner, mint);
  const after = atomsFor(post, owner, mint);
  if (after === undefined) return undefined;
  const delta = BigInt(after) - BigInt(before ?? '0');
  if (delta <= 0n) return undefined;
  return delta.toString();
}

function atomsFor(rows: TokenBalance[], owner: string, mint: string): string | undefined {
  for (const row of rows) {
    if (row.owner !== owner || row.mint !== mint) continue;
    const amount = row.uiTokenAmount?.amount;
    if (typeof amount === 'string' && /^\d+$/.test(amount)) return amount;
  }
  return undefined;
}
