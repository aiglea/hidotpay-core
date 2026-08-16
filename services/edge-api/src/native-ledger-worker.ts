import { corsHeadersForRequest, corsPreflightResponse, withCors } from './cors.js';
import { nativeErrorResponse } from './native-response.js';

export type NativeLedgerRuntime<Actor = unknown> = {
  handle(request: Request, actor: Actor): Promise<Response>;
};

export type NativeLedgerWorkerEnv = {
  CORS_ALLOWED_ORIGINS?: string;
  LEDGER_API_ENABLED: string;
};

export type NativeLedgerWorkerOptions<Env extends NativeLedgerWorkerEnv, Actor> = {
  authenticate(env: Env, headers: Headers, request: Request): Promise<Actor>;
  createRuntime(env: Env): Promise<NativeLedgerRuntime<Actor>>;
};

export function createNativeLedgerHandler<Env extends NativeLedgerWorkerEnv, Actor = unknown>(options: NativeLedgerWorkerOptions<Env, Actor>) {
  return async (request: Request, env: Env): Promise<Response> => {
    const { pathname } = new URL(request.url);
    if (pathname === '/healthz') return Response.json({ status: 'ok' });
    if (!pathname.startsWith('/v1/')) return new Response('Not Found', { status: 404 });
    const corsHeaders = corsHeadersForRequest(request, env);
    if (request.method === 'OPTIONS') return corsPreflightResponse(request, corsHeaders);
    if (corsHeaders === null) return new Response('Forbidden', { status: 403 });
    const respond = (response: Response) => withCors(response, corsHeaders);
    if (!request.headers.get('authorization')) return respond(new Response('Unauthorized', { status: 401 }));
    if (pathname === '/v1/deposits/confirmed' && request.headers.get('origin')) return respond(new Response('Forbidden', { status: 403 }));
    if (env.LEDGER_API_ENABLED !== 'true') return respond(new Response('Service Unavailable', { status: 503 }));

    try {
      const actor = await options.authenticate(env, request.headers, request);
      return respond(await (await options.createRuntime(env)).handle(request, actor));
    } catch (error) {
      const response = nativeErrorResponse(error);
      if (response) return respond(response);
      return respond(new Response('Service Unavailable', { status: 503 }));
    }
  };
}
