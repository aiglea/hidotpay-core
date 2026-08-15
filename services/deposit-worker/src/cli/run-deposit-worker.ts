import { once } from 'node:events';
import { Pool } from 'pg';

import { loadDepositWorkerConfig } from '../config.js';
import { EvmFailoverAdapter } from '../evm-failover-adapter.js';
import { EvmJsonRpcProvider } from '../evm-rpc-provider.js';
import { LedgerDepositCreditor } from '../ledger-deposit-creditor.js';
import { PostgresDepositCatalog } from '../postgres-deposit-catalog.js';
import { PostgresDepositScanStore } from '../postgres-scan-store.js';
import { runConfiguredNetwork } from '../run-configured-network.js';
import { createDepositWorkerHealthServer } from '../runtime-health.js';
import type { DepositChainAdapter } from '../scanner.js';
import { TronFailoverAdapter } from '../tron-failover-adapter.js';
import { TronSolidifiedProvider } from '../tron-solidified-provider.js';

const config = loadDepositWorkerConfig(process.env);
const pool = new Pool({ connectionString: config.databaseUrl });
const catalog = new PostgresDepositCatalog(pool);
const store = new PostgresDepositScanStore(pool);
const creditor = new LedgerDepositCreditor({ bearerToken: config.ledgerBearerToken, url: config.ledgerUrl });
const adapters: Array<{ adapter: DepositChainAdapter; firstBlock: number }> = config.evmNetworks.map((network) => ({
  adapter: new EvmFailoverAdapter(network.network, network.chainId, network.rpcUrls.map((url) => new EvmJsonRpcProvider({ url }))),
  firstBlock: network.firstBlock,
}));
adapters.push(...config.tronNetworks.map((network) => ({
  adapter: new TronFailoverAdapter(network.network, network.genesisBlockHash, network.rpcUrls.map((url) => new TronSolidifiedProvider({ apiKey: network.apiKey, url }))),
  firstBlock: network.firstBlock,
})));
const health = createDepositWorkerHealthServer();
health.server.listen(8080, '0.0.0.0');
await once(health.server, 'listening');

let stopping = false;
const stop = async (): Promise<void> => {
  if (stopping) return;
  stopping = true;
  health.markStopping();
  await new Promise<void>((resolve, reject) => health.server.close((error) => error ? reject(error) : resolve()));
  await pool.end();
};
process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });

try {
  process.stdout.write('deposit worker started\n');
  while (!stopping) {
    try {
      for (const item of adapters) await runConfiguredNetwork({ adapter: item.adapter, catalog, creditor, firstBlock: item.firstBlock, maxBlockRange: config.maxBlockRange, reorgWindow: config.reorgWindow, store });
      health.markReady();
    } catch (error) {
      health.markUnready();
      process.stderr.write(`deposit worker scan failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
    }
    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
  }
} finally { await stop().catch(() => undefined); }
