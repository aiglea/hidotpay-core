import { DomainError } from '../domain/errors.js';

export type ChainTransfer = {
  amountAtoms: string;
  blockHash: string;
  blockHeight: number;
  contractIdentifier: string;
  destinationAddress: string;
  eventIndex: number;
  network: string;
  transactionHash: string;
};

export type TransferQuery = {
  contractIdentifier: string;
  fromBlock: number;
  toBlock: number;
  watchedAddresses: string[];
};

export interface ChainAdapter {
  getBlockHash(height: number): Promise<string>;
  getHead(): Promise<number>;
  listTokenTransfers(query: TransferQuery): Promise<ChainTransfer[]>;
  readonly network: string;
}

export type EvmRpcProvider = {
  getBlockHash(height: number): Promise<string>;
  getChainId(): Promise<number>;
  getHead(): Promise<number>;
  listTokenTransfers(query: TransferQuery): Promise<Array<Omit<ChainTransfer, 'eventIndex' | 'network'> & { logIndex: number }>>;
};

export type TronRpcProvider = {
  getBlockHash(height: number): Promise<string>;
  getHead(): Promise<number>;
  getNetworkId(): Promise<string>;
  listTokenTransfers(query: TransferQuery): Promise<Array<Omit<ChainTransfer, 'eventIndex' | 'network'> & { eventIndex: number }>>;
};

export class EvmAdapter implements ChainAdapter {
  public constructor(public readonly network: string, private readonly expectedChainId: number, private readonly providers: EvmRpcProvider[]) {
    if (!Number.isSafeInteger(expectedChainId) || expectedChainId < 1 || providers.length === 0) throw new Error('invalid EVM adapter configuration');
  }

  public async getHead(): Promise<number> {
    return this.withProvider((provider) => provider.getHead());
  }

  public async getBlockHash(height: number): Promise<string> {
    return this.withProvider((provider) => provider.getBlockHash(height));
  }

  public async listTokenTransfers(query: TransferQuery): Promise<ChainTransfer[]> {
    const rows = await this.withProvider((provider) => provider.listTokenTransfers(query));
    return rows.map((row) => ({
      amountAtoms: row.amountAtoms,
      blockHash: row.blockHash,
      blockHeight: row.blockHeight,
      contractIdentifier: row.contractIdentifier,
      destinationAddress: row.destinationAddress,
      eventIndex: row.logIndex,
      network: this.network,
      transactionHash: row.transactionHash,
    }));
  }

  private async withProvider<T>(operation: (provider: EvmRpcProvider) => Promise<T>): Promise<T> {
    for (const provider of this.providers) {
      try {
        if (await provider.getChainId() !== this.expectedChainId) continue;
        return await operation(provider);
      } catch {
        // A failed provider is not trusted. The next configured provider will be checked again.
      }
    }
    throw new DomainError('chain_rpc_unavailable');
  }
}

export class TronAdapter implements ChainAdapter {
  public constructor(public readonly network: string, private readonly expectedNetworkId: string, private readonly providers: TronRpcProvider[]) {
    if (expectedNetworkId.length === 0 || providers.length === 0) throw new Error('invalid TRON adapter configuration');
  }

  public async getHead(): Promise<number> {
    return this.withProvider((provider) => provider.getHead());
  }

  public async getBlockHash(height: number): Promise<string> {
    return this.withProvider((provider) => provider.getBlockHash(height));
  }

  public async listTokenTransfers(query: TransferQuery): Promise<ChainTransfer[]> {
    const rows = await this.withProvider((provider) => provider.listTokenTransfers(query));
    return rows.map((row) => ({ ...row, network: this.network }));
  }

  private async withProvider<T>(operation: (provider: TronRpcProvider) => Promise<T>): Promise<T> {
    for (const provider of this.providers) {
      try {
        if (await provider.getNetworkId() !== this.expectedNetworkId) continue;
        return await operation(provider);
      } catch {
        // A failed provider is not trusted. The next configured provider will be checked again.
      }
    }
    throw new DomainError('chain_rpc_unavailable');
  }
}
