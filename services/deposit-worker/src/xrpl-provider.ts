import { httpsEndpoint, runtimeFetch, timeoutInit, type Fetch } from './https-endpoint.js';

type TransferQuery = { contractIdentifier: string; fromBlock: number; toBlock: number; watchedAddresses: string[] };
type RpcTransfer = { amountAtoms: string; blockHash: string; blockHeight: number; contractIdentifier: string; destinationAddress: string; logIndex: number; transactionHash: string };

export class XrplJsonRpcProvider {
  private readonly endpoint: URL;
  private readonly fetcher: Fetch;

  public constructor(config: { fetch?: Fetch; url: string }) {
    this.endpoint = httpsEndpoint(config.url);
    this.fetcher = runtimeFetch(config.fetch);
  }

  public async getHead(): Promise<number> {
    const result = await this.call('ledger_current', [{}]);
    const height = result && typeof result === 'object' ? (result as { ledger_current_index?: unknown }).ledger_current_index : undefined;
    if (typeof height !== 'number' || !Number.isSafeInteger(height) || height < 1) throw new Error('XRPL RPC returned invalid ledger');
    return height;
  }

  public async getBlockHash(height: number): Promise<string> {
    if (!Number.isSafeInteger(height) || height < 1) throw new Error('invalid XRPL ledger');
    const result = await this.call('ledger', [{ ledger_index: height }]);
    const hash = result && typeof result === 'object' ? (result as { ledger_hash?: unknown }).ledger_hash : undefined;
    if (typeof hash !== 'string' || !/^[0-9A-Fa-f]{16,128}$/.test(hash)) throw new Error('XRPL RPC returned invalid ledger hash');
    return hash;
  }

  public async listTokenTransfers(query: TransferQuery): Promise<RpcTransfer[]> {
    if (query.contractIdentifier !== 'native:xrp' || !Number.isSafeInteger(query.fromBlock) || !Number.isSafeInteger(query.toBlock) || query.fromBlock < 1 || query.toBlock < query.fromBlock) {
      throw new Error('invalid XRPL transfer query');
    }
    const result: RpcTransfer[] = [];
    for (const destinationAddress of query.watchedAddresses) {
      if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(destinationAddress)) throw new Error('invalid watched XRPL address');
      const payload = await this.call('account_tx', [{
        account: destinationAddress,
        ledger_index_max: query.toBlock,
        ledger_index_min: query.fromBlock,
      }]);
      const transactions = payload && typeof payload === 'object' ? (payload as { transactions?: unknown }).transactions : undefined;
      if (!Array.isArray(transactions)) throw new Error('XRPL RPC returned invalid transactions');
      for (const item of transactions) {
        if (!item || typeof item !== 'object') continue;
        const row = item as { meta?: { TransactionIndex?: unknown; TransactionResult?: unknown }; tx?: Record<string, unknown> };
        const tx = row.tx;
        if (!tx || tx.TransactionType !== 'Payment' || tx.Destination !== destinationAddress || typeof tx.Amount !== 'string' || !/^[1-9]\d*$/.test(tx.Amount)) continue;
        if (row.meta?.TransactionResult !== 'tesSUCCESS' || typeof tx.hash !== 'string' || typeof tx.ledger_index !== 'number') continue;
        if (tx.ledger_index < query.fromBlock || tx.ledger_index > query.toBlock) continue;
        const logIndex = typeof row.meta?.TransactionIndex === 'number' ? row.meta.TransactionIndex : 0;
        result.push({
          amountAtoms: tx.Amount,
          blockHash: await this.getBlockHash(tx.ledger_index),
          blockHeight: tx.ledger_index,
          contractIdentifier: 'native:xrp',
          destinationAddress,
          logIndex,
          transactionHash: tx.hash,
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
    if (!response.ok) throw new Error('XRPL RPC request failed');
    const payload = await response.json() as { result?: { status?: unknown } & Record<string, unknown> };
    if (!payload.result || payload.result.status !== 'success') throw new Error('XRPL RPC returned an error');
    return payload.result;
  }
}
