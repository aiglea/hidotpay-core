import { getRandom } from '@cloudflare/containers';
import { corsHeadersForRequest, corsPreflightResponse, withCors } from './cors.js';
import { LedgerContainer } from './ledger-container.js';

export interface Env {
  CORS_ALLOWED_ORIGINS?: string;
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
    const corsHeaders = corsHeadersForRequest(request, env);
    if (request.method === 'OPTIONS') return corsPreflightResponse(request, corsHeaders);
    if (corsHeaders === null) return new Response('Forbidden', { status: 403 });
    const respond = (response: Response) => withCors(response, corsHeaders);
    if (!request.headers.get('authorization')) return respond(new Response('Unauthorized', { status: 401 }));
    if (env.LEDGER_API_ENABLED !== 'true') return respond(new Response('Service Unavailable', { status: 503 }));

    const container = await getRandom(env.LEDGER_CONTAINER, 1);
    return respond(await container.fetch(request));
  },
};
