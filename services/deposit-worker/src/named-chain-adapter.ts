import type { ChainTransfer, DepositChainAdapter, TransferQuery } from './scanner.js';

type InnerProvider = {
  getBlockHash(height: number): Promise<string>;
  getHead(): Promise<number>;
  listTokenTransfers(query: TransferQuery): Promise<Array<Omit<ChainTransfer, 'eventIndex' | 'network'> & { logIndex: number }>>;
};

export class NamedChainAdapter implements DepositChainAdapter {
  public constructor(public readonly network: string, private readonly provider: InnerProvider) {}

  public getHead(): Promise<number> { return this.provider.getHead(); }
  public getBlockHash(height: number): Promise<string> { return this.provider.getBlockHash(height); }

  public async listTokenTransfers(query: TransferQuery): Promise<ChainTransfer[]> {
    const rows = await this.provider.listTokenTransfers(query);
    return rows.map(({ logIndex, ...row }) => ({ ...row, eventIndex: logIndex, network: this.network }));
  }
}
