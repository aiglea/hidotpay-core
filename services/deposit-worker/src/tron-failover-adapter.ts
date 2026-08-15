import type { ChainTransfer, DepositChainAdapter, TransferQuery } from './scanner.js';

type TronProvider = { getBlockHash(height: number): Promise<string>; getHead(): Promise<number>; listTokenTransfers(query: TransferQuery): Promise<Array<Omit<ChainTransfer, 'network'>>> };

export class TronFailoverAdapter implements DepositChainAdapter {
  public constructor(public readonly network: string, private readonly expectedGenesisBlockHash: string, private readonly providers: TronProvider[]) {
    if (!/^[a-fA-F0-9]{64}$/.test(expectedGenesisBlockHash) || providers.length < 1) throw new Error('TRON failover adapter is invalid');
  }
  public getHead(): Promise<number> { return this.withProvider((provider) => provider.getHead()); }
  public getBlockHash(height: number): Promise<string> { return this.withProvider((provider) => provider.getBlockHash(height)); }
  public async listTokenTransfers(query: TransferQuery): Promise<ChainTransfer[]> { return (await this.withProvider((provider) => provider.listTokenTransfers(query))).map((transfer) => ({ ...transfer, network: this.network })); }
  private async withProvider<T>(operation: (provider: TronProvider) => Promise<T>): Promise<T> {
    for (const provider of this.providers) {
      try {
        if ((await provider.getBlockHash(0)).toLowerCase() !== this.expectedGenesisBlockHash.toLowerCase()) continue;
        return await operation(provider);
      } catch { /* failed or wrong-chain provider is never trusted */ }
    }
    throw new Error('all TRON providers are unavailable or on the wrong chain');
  }
}
