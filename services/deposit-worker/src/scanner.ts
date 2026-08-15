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

export interface DepositChainAdapter {
  getBlockHash(height: number): Promise<string>;
  getHead(): Promise<number>;
  listTokenTransfers(query: TransferQuery): Promise<ChainTransfer[]>;
  readonly network: string;
}

export interface DepositPolicy {
  get(network: string, assetCode: string): { contractIdentifier: string };
  requireDeposit(input: { assetCode: string; confirmationCount: number; contractIdentifier: string; network: string }): unknown;
}

export type DepositTarget = { accountId: string; address: string; assetCode: string };
export type ScanCursor = { blockHash: string; height: number };
export type DepositObservation = ChainTransfer & { accountId: string; assetCode: string; confirmationCount: number; status: 'finalized_candidate' };
export type StoredDepositObservation = Omit<DepositObservation, 'status'> & { status: 'credited' | 'finalized_candidate' };

export interface DepositCreditor {
  credit(observation: DepositObservation): Promise<void>;
}

export interface DepositScanStore {
  assertNoOrphanedCredits(network: string): Promise<void>;
  cursor(network: string): Promise<ScanCursor | undefined>;
  saveCursor(network: string, cursor: ScanCursor): Promise<void>;
  upsertObservation(observation: DepositObservation): Promise<'creditable' | 'already_credited'>;
  markCredited(observation: DepositObservation): Promise<void>;
}

export class DepositScanner {
  public constructor(
    private readonly adapter: DepositChainAdapter,
    private readonly store: DepositScanStore,
    private readonly policy: DepositPolicy,
    private readonly config: { maxBlockRange?: number; reorgWindow: number },
    private readonly creditor?: DepositCreditor,
  ) {
    if (!Number.isSafeInteger(config.reorgWindow) || config.reorgWindow < 1) throw new Error('reorgWindow must be a positive integer');
    if (config.maxBlockRange !== undefined && (!Number.isSafeInteger(config.maxBlockRange) || config.maxBlockRange < 1)) throw new Error('maxBlockRange must be a positive integer');
  }

  public async scan(targets: DepositTarget[], firstBlock: number): Promise<{ candidates: number; fromBlock: number; head: number; reorgRecovered: boolean }> {
    if (!Number.isSafeInteger(firstBlock) || firstBlock < 0) throw new Error('firstBlock must be a non-negative integer');
    await this.store.assertNoOrphanedCredits(this.adapter.network);
    const cursor = await this.store.cursor(this.adapter.network);
    if (cursor && await this.adapter.getBlockHash(cursor.height) !== cursor.blockHash) throw new Error('deep_chain_reorg_detected');
    const head = await this.adapter.getHead();
    const safeHead = head - this.config.reorgWindow;
    if (safeHead < firstBlock) return { candidates: 0, fromBlock: firstBlock, head, reorgRecovered: false };
    const fromBlock = cursor ? cursor.height + 1 : firstBlock;
    if (fromBlock > safeHead) return { candidates: 0, fromBlock, head, reorgRecovered: false };
    const toBlock = Math.min(safeHead, fromBlock + (this.config.maxBlockRange ?? Number.MAX_SAFE_INTEGER) - 1);

    let candidates = 0;
    for (const target of targets) {
      const policy = this.policy.get(this.adapter.network, target.assetCode);
      const events = await this.adapter.listTokenTransfers({
        contractIdentifier: policy.contractIdentifier,
        fromBlock,
        toBlock,
        watchedAddresses: [target.address],
      });
      for (const event of events) {
        if (event.network !== this.adapter.network || event.destinationAddress !== target.address || event.contractIdentifier !== policy.contractIdentifier) continue;
        const confirmationCount = head - event.blockHeight + 1;
        try {
          this.policy.requireDeposit({ assetCode: target.assetCode, confirmationCount, contractIdentifier: event.contractIdentifier, network: this.adapter.network });
        } catch {
          continue;
        }
        const observation = { ...event, accountId: target.accountId, assetCode: target.assetCode, confirmationCount, status: 'finalized_candidate' as const };
        if (await this.store.upsertObservation(observation) === 'creditable') {
          candidates += 1;
          if (!this.creditor) continue;
          await this.creditor.credit(observation);
          await this.store.markCredited(observation);
        }
      }
    }
    await this.store.saveCursor(this.adapter.network, { blockHash: await this.adapter.getBlockHash(toBlock), height: toBlock });
    return { candidates, fromBlock, head, reorgRecovered: false };
  }

}

export class InMemoryDepositScanStore implements DepositScanStore {
  private readonly cursors = new Map<string, ScanCursor>();
  private readonly values = new Map<string, StoredDepositObservation>();

  public async assertNoOrphanedCredits(_network: string): Promise<void> {}

  public async cursor(network: string): Promise<ScanCursor | undefined> {
    const value = this.cursors.get(network);
    return value ? { ...value } : undefined;
  }

  public async saveCursor(network: string, cursor: ScanCursor): Promise<void> {
    this.cursors.set(network, { ...cursor });
  }

  public async upsertObservation(observation: DepositObservation): Promise<'creditable' | 'already_credited'> {
    const key = this.key(observation);
    const existing = this.values.get(key);
    if (existing?.status === 'credited') return 'already_credited';
    if (existing) return 'creditable';
    this.values.set(key, { ...observation });
    return 'creditable';
  }

  public async markCredited(observation: DepositObservation): Promise<void> {
    const value = this.values.get(this.key(observation));
    if (!value) throw new Error('deposit observation does not exist');
    value.status = 'credited';
  }

  public observations(): StoredDepositObservation[] {
    return [...this.values.values()].map((value) => ({ ...value }));
  }

  private key(observation: Pick<DepositObservation, 'eventIndex' | 'network' | 'transactionHash'>): string {
    return `${observation.network}:${observation.transactionHash}:${observation.eventIndex}`;
  }
}
