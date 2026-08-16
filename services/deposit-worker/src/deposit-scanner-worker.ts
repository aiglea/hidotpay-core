import { Pool } from 'pg';

import { bootstrapScanCursor } from './bootstrap-scan-cursor.js';
import { EvmFailoverAdapter } from './evm-failover-adapter.js';
import { EvmJsonRpcProvider } from './evm-rpc-provider.js';
import { LedgerDepositCreditor } from './ledger-deposit-creditor.js';
import { loadOfficialTestnetScannerConfig } from './official-testnet-scanner.js';
import { PostgresDepositCatalog } from './postgres-deposit-catalog.js';
import { PostgresDepositScanStore } from './postgres-scan-store.js';
import { runConfiguredNetwork } from './run-configured-network.js';
import type { DepositChainAdapter } from './scanner.js';
import { TronFailoverAdapter } from './tron-failover-adapter.js';
import { TronSolidifiedProvider } from './tron-solidified-provider.js';

export type DepositScannerEnv = {
  CHAIN_OPERATOR_TOKEN?: string;
  HYPERDRIVE: { connectionString: string };
  NATIVE_LEDGER: { fetch: typeof fetch };
  TRON_SHASTA_API_KEY?: string;
};

export default {
  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === '/healthz') return Response.json({ status: 'ok' });
    return new Response('Not Found', { status: 404 });
  },

  async scheduled(_event: unknown, env: DepositScannerEnv, ctx: { waitUntil(promise: Promise<unknown>): void }): Promise<void> {
    ctx.waitUntil(scanOfficialTestnets(env));
  },
};

export async function scanOfficialTestnets(env: DepositScannerEnv): Promise<void> {
  if (!env.HYPERDRIVE.connectionString) throw new Error('Hyperdrive connection is unavailable');
  const config = loadOfficialTestnetScannerConfig({
    CHAIN_OPERATOR_TOKEN: env.CHAIN_OPERATOR_TOKEN,
    TRON_SHASTA_API_KEY: env.TRON_SHASTA_API_KEY,
  });
  const pool = new Pool({ connectionString: env.HYPERDRIVE.connectionString });
  try {
    const catalog = new PostgresDepositCatalog(pool);
    const store = new PostgresDepositScanStore(pool);
    const creditor = new LedgerDepositCreditor({
      bearerToken: config.ledgerBearerToken,
      fetch: env.NATIVE_LEDGER.fetch.bind(env.NATIVE_LEDGER),
      url: 'https://hidotpay-native-ledger-staging.lgninhk.workers.dev',
    });
    const adapters: DepositChainAdapter[] = [
      ...config.evmNetworks.map((network) => new EvmFailoverAdapter(
        network.network,
        network.chainId,
        network.rpcUrls.map((url) => new EvmJsonRpcProvider({ url })),
      )),
      ...config.tronNetworks.map((network) => new TronFailoverAdapter(
        network.network,
        network.genesisBlockHash,
        network.rpcUrls.map((url) => new TronSolidifiedProvider({ apiKey: network.apiKey, url })),
      )),
    ];
    for (const adapter of adapters) {
      await bootstrapScanCursor({ adapter, reorgWindow: config.reorgWindow, store });
      await runConfiguredNetwork({
        adapter,
        catalog,
        creditor,
        firstBlock: 0,
        maxBlockRange: config.maxBlockRange,
        reorgWindow: config.reorgWindow,
        store,
      });
    }
  } finally {
    await pool.end();
  }
}
