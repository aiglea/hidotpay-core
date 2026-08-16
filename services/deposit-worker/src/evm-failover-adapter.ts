import type { DepositChainAdapter, ChainTransfer, TransferQuery } from './scanner.js';

type EvmProvider = {
  getBlockHash(height: number): Promise<string>;
  getChainId(): Promise<number>;
  getHead(): Promise<number>;
  listTokenTransfers(query: TransferQuery): Promise<Array<Omit<ChainTransfer, 'eventIndex' | 'network'> & { logIndex: number }>>;
};

/** Every operation verifies the selected provider's chain id before trusting it. */
export class EvmFailoverAdapter implements DepositChainAdapter {
  public constructor(public readonly network: string, private readonly expectedChainId: number, private readonly providers: EvmProvider[]) {
    if (!Number.isSafeInteger(expectedChainId) || expectedChainId < 1 || providers.length < 1) throw new Error('EVM failover adapter is invalid');
  }

  public getHead(): Promise<number> { return this.withProvider((provider) => provider.getHead()); }
  public getBlockHash(height: number): Promise<string> { return this.withProvider((provider) => provider.getBlockHash(height)); }

  public async listTokenTransfers(query: TransferQuery): Promise<ChainTransfer[]> {
    const rows = await this.withProvider((provider) => provider.listTokenTransfers(query));
    return rows.map(({ logIndex, ...row }) => ({ ...row, eventIndex: logIndex, network: this.network }));
  }

  private async withProvider<T>(operation: (provider: EvmProvider) => Promise<T>): Promise<T> {
    const failures: string[] = [];
    for (const provider of this.providers) {
      try {
        if (await provider.getChainId() !== this.expectedChainId) {
          failures.push('wrong chain');
          continue;
        }
        return await operation(provider);
      } catch (error) {
        failures.push(error instanceof Error ? error.message : 'unknown');
      }
    }
    throw new Error(`all EVM RPC providers are unavailable or on the wrong chain: ${failures.join('; ')}`);
  }
}
