import { getRandom } from '@cloudflare/containers';
import { LedgerContainer } from './ledger-container.js';

export interface Env {
  LEDGER_API_ENABLED: string;
  LEDGER_CONTAINER: DurableObjectNamespace<LedgerContainer>;
}

export { LedgerContainer } from './ledger-container.js';
export { ContainerProxy } from '@cloudflare/containers';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/healthz') return Response.json({ status: 'ok' });
    if (!url.pathname.startsWith('/v1/')) return new Response('Not Found', { status: 404 });
    if (!request.headers.get('authorization')) return new Response('Unauthorized', { status: 401 });
    if (env.LEDGER_API_ENABLED !== 'true') return new Response('Service Unavailable', { status: 503 });

    const container = await getRandom(env.LEDGER_CONTAINER, 1);
    return container.fetch(request);
  },
};
