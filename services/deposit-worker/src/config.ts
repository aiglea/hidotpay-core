export type EvmDepositNetwork = { chainId: number; firstBlock: number; network: string; rpcUrls: string[] };
export type TronDepositNetwork = { apiKey: string; firstBlock: number; genesisBlockHash: string; network: string; rpcUrls: string[] };
export type DepositWorkerConfig = { databaseUrl: string; evmNetworks: EvmDepositNetwork[]; ledgerBearerToken: string; ledgerUrl: string; maxBlockRange: number; pollIntervalMs: number; reorgWindow: number; tronNetworks: TronDepositNetwork[] };

export function loadDepositWorkerConfig(env: NodeJS.ProcessEnv): DepositWorkerConfig {
  const databaseUrl = required(env.DATABASE_URL, 'DATABASE_URL');
  const ledgerUrl = privateHttps(required(env.DEPOSIT_LEDGER_URL, 'DEPOSIT_LEDGER_URL'), 'DEPOSIT_LEDGER_URL');
  const ledgerBearerToken = required(env.DEPOSIT_LEDGER_BEARER_TOKEN, 'DEPOSIT_LEDGER_BEARER_TOKEN');
  if (ledgerBearerToken.length < 16) throw new Error('DEPOSIT_LEDGER_BEARER_TOKEN is invalid');
  const evmNetworks = parseNetworks(env.DEPOSIT_EVM_NETWORKS ?? '[]');
  const tronNetworks = parseTronNetworks(env.DEPOSIT_TRON_NETWORKS ?? '[]');
  if (evmNetworks.length + tronNetworks.length < 1) throw new Error('at least one deposit network is required');
  const pollIntervalMs = env.DEPOSIT_POLL_INTERVAL_MS === undefined ? 1000 : range(env.DEPOSIT_POLL_INTERVAL_MS, 'DEPOSIT_POLL_INTERVAL_MS', 100, 60_000);
  const reorgWindow = env.DEPOSIT_REORG_WINDOW === undefined ? 32 : range(env.DEPOSIT_REORG_WINDOW, 'DEPOSIT_REORG_WINDOW', 1, 10_000);
  const maxBlockRange = env.DEPOSIT_MAX_BLOCK_RANGE === undefined ? 1000 : range(env.DEPOSIT_MAX_BLOCK_RANGE, 'DEPOSIT_MAX_BLOCK_RANGE', 1, 10_000);
  return { databaseUrl, evmNetworks, ledgerBearerToken, ledgerUrl, maxBlockRange, pollIntervalMs, reorgWindow, tronNetworks };
}

function parseNetworks(value: string): EvmDepositNetwork[] {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error('DEPOSIT_EVM_NETWORKS must be JSON'); }
  if (!Array.isArray(parsed) || parsed.length > 32) throw new Error('DEPOSIT_EVM_NETWORKS must contain at most 32 networks');
  const names = new Set<string>();
  return parsed.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('DEPOSIT_EVM_NETWORKS item is invalid');
    const row = item as Record<string, unknown>;
    if (typeof row.network !== 'string' || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(row.network) || names.has(row.network)) throw new Error('DEPOSIT_EVM_NETWORKS network is invalid');
    names.add(row.network);
    if (typeof row.chainId !== 'number' || !Number.isSafeInteger(row.chainId) || row.chainId < 1 || typeof row.firstBlock !== 'number' || !Number.isSafeInteger(row.firstBlock) || row.firstBlock < 0) throw new Error('DEPOSIT_EVM_NETWORKS chainId or firstBlock is invalid');
    if (!Array.isArray(row.rpcUrls) || row.rpcUrls.length < 1 || row.rpcUrls.length > 5 || row.rpcUrls.some((url) => typeof url !== 'string')) throw new Error('DEPOSIT_EVM_NETWORKS rpcUrls is invalid');
    return { chainId: row.chainId, firstBlock: row.firstBlock, network: row.network, rpcUrls: (row.rpcUrls as string[]).map((url) => privateHttps(url, 'DEPOSIT_EVM_NETWORKS RPC URL')) };
  });
}

function parseTronNetworks(value: string): TronDepositNetwork[] {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error('DEPOSIT_TRON_NETWORKS must be JSON'); }
  if (!Array.isArray(parsed) || parsed.length > 32) throw new Error('DEPOSIT_TRON_NETWORKS must contain at most 32 networks');
  return parsed.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('DEPOSIT_TRON_NETWORKS item is invalid');
    const row = item as Record<string, unknown>;
    if (typeof row.network !== 'string' || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(row.network) || typeof row.apiKey !== 'string' || row.apiKey.length < 16 || typeof row.genesisBlockHash !== 'string' || !/^[a-fA-F0-9]{64}$/.test(row.genesisBlockHash) || typeof row.firstBlock !== 'number' || !Number.isSafeInteger(row.firstBlock) || row.firstBlock < 0 || !Array.isArray(row.rpcUrls) || row.rpcUrls.length < 1 || row.rpcUrls.length > 5 || row.rpcUrls.some((url) => typeof url !== 'string')) throw new Error('DEPOSIT_TRON_NETWORKS item is invalid');
    return { apiKey: row.apiKey, firstBlock: row.firstBlock, genesisBlockHash: row.genesisBlockHash, network: row.network, rpcUrls: (row.rpcUrls as string[]).map((url) => privateHttps(url, 'DEPOSIT_TRON_NETWORKS RPC URL')) };
  });
}

function privateHttps(value: string, name: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${name} must be private HTTPS`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error(`${name} must be private HTTPS`);
  return url.toString();
}

function required(value: string | undefined, name: string): string { if (!value) throw new Error(`${name} is required`); return value; }
function range(value: string, name: string, min: number, max: number): number {
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error(`${name} must be between ${min} and ${max}`);
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < min || numeric > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return numeric;
}
