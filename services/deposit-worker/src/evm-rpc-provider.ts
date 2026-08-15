type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>;
type TransferQuery = { contractIdentifier: string; fromBlock: number; toBlock: number; watchedAddresses: string[] };
type RpcTransfer = { amountAtoms: string; blockHash: string; blockHeight: number; contractIdentifier: string; destinationAddress: string; logIndex: number; transactionHash: string };

const transferTopic = '0xddf252ad00000000000000000000000000000000000000000000000000000000';
const address = /^0x[0-9a-fA-F]{40}$/;
const hash = /^0x[0-9a-fA-F]{64}$/;

/** Read-only EVM JSON-RPC client. It can observe token transfers but cannot sign or broadcast anything. */
export class EvmJsonRpcProvider {
  private readonly endpoint: URL;
  private readonly fetcher: Fetch;

  public constructor(config: { fetch?: Fetch; url: string }) {
    this.endpoint = new URL(config.url);
    if (this.endpoint.protocol !== 'https:' || this.endpoint.username || this.endpoint.password || this.endpoint.hash) throw new Error('EVM RPC URL must be HTTPS without credentials');
    this.fetcher = config.fetch ?? fetch;
  }

  public async getChainId(): Promise<number> { return this.hexNumber(await this.call('eth_chainId', [])); }
  public async getHead(): Promise<number> { return this.hexNumber(await this.call('eth_blockNumber', [])); }

  public async getBlockHash(height: number): Promise<string> {
    const block = await this.call('eth_getBlockByNumber', [hex(height), false]);
    const value = block && typeof block === 'object' ? (block as { hash?: unknown }).hash : undefined;
    if (typeof value !== 'string' || !hash.test(value)) throw new Error('EVM RPC returned invalid block hash');
    return value;
  }

  public async listTokenTransfers(query: TransferQuery): Promise<RpcTransfer[]> {
    if (!address.test(query.contractIdentifier) || !Number.isSafeInteger(query.fromBlock) || !Number.isSafeInteger(query.toBlock) || query.fromBlock < 0 || query.toBlock < query.fromBlock) throw new Error('invalid EVM transfer query');
    const result: RpcTransfer[] = [];
    for (const destinationAddress of query.watchedAddresses) {
      if (!address.test(destinationAddress)) throw new Error('invalid watched EVM address');
      const logs = await this.call('eth_getLogs', [{
        address: query.contractIdentifier,
        fromBlock: hex(query.fromBlock),
        toBlock: hex(query.toBlock),
        topics: [transferTopic, null, topicAddress(destinationAddress)],
      }]);
      if (!Array.isArray(logs)) throw new Error('EVM RPC returned invalid logs');
      for (const log of logs) result.push(this.decodeLog(log, query.contractIdentifier, destinationAddress));
    }
    return result;
  }

  private async call(method: string, params: unknown[]): Promise<unknown> {
    const response = await this.fetcher(this.endpoint, {
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params }),
      headers: { 'content-type': 'application/json' }, method: 'POST', signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('EVM RPC request failed');
    const payload = await response.json() as { error?: unknown; result?: unknown };
    if (payload.error || payload.result === undefined) throw new Error('EVM RPC returned an error');
    return payload.result;
  }

  private decodeLog(log: unknown, contractIdentifier: string, destinationAddress: string): RpcTransfer {
    if (!log || typeof log !== 'object') throw new Error('EVM RPC returned invalid log');
    const row = log as Record<string, unknown>;
    if (typeof row.blockHash !== 'string' || !hash.test(row.blockHash) || typeof row.transactionHash !== 'string' || !hash.test(row.transactionHash) || typeof row.blockNumber !== 'string' || typeof row.logIndex !== 'string' || typeof row.data !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(row.data) || !Array.isArray(row.topics) || row.topics[0]?.toLowerCase() !== transferTopic || row.topics[2]?.toLowerCase() !== topicAddress(destinationAddress)) throw new Error('EVM RPC returned invalid log');
    const amountAtoms = BigInt(row.data).toString();
    if (amountAtoms === '0') throw new Error('EVM RPC returned zero transfer');
    return { amountAtoms, blockHash: row.blockHash, blockHeight: this.hexNumber(row.blockNumber), contractIdentifier, destinationAddress, logIndex: this.hexNumber(row.logIndex), transactionHash: row.transactionHash };
  }

  private hexNumber(value: unknown): number {
    if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) throw new Error('EVM RPC returned invalid quantity');
    const result = Number(BigInt(value));
    if (!Number.isSafeInteger(result) || result < 0) throw new Error('EVM RPC quantity exceeds safe range');
    return result;
  }
}

function hex(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('invalid EVM block height');
  return `0x${value.toString(16)}`;
}

function topicAddress(value: string): string { return `0x${value.slice(2).toLowerCase().padStart(64, '0')}`; }
