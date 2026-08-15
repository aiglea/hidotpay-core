import type { AdminReadModelConfig } from './config.js';
import { NocoBaseProjectionTarget } from './nocobase-target.js';
import { AdminReadModelProjector } from './projector.js';
import { PostgresAdminProjectionSource } from './source-reader.js';

type QueryClient = {
  query: (sql: string) => Promise<{ rows: Record<string, unknown>[] }>;
};

type FetchFunction = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function createReadModelRuntime(config: AdminReadModelConfig, sourceClient: QueryClient, fetch: FetchFunction = globalThis.fetch): AdminReadModelProjector {
  return new AdminReadModelProjector(
    new PostgresAdminProjectionSource(sourceClient),
    new NocoBaseProjectionTarget({ baseUrl: config.nocoBaseUrl, fetch, token: config.nocoBaseToken }),
  );
}
