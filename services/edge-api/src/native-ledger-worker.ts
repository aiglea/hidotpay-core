import { nativeErrorResponse } from './native-response.js';

export type NativeLedgerRuntime<Actor = unknown> = {
  handle(request: Request, actor: Actor): Promise<Response>;
};

export type NativeLedgerWorkerEnv = {
  LEDGER_API_ENABLED: string;
};

export type NativeLedgerWorkerOptions<Env extends NativeLedgerWorkerEnv, Actor> = {
  authenticate(env: Env, headers: Headers): Promise<Actor>;
  createRuntime(env: Env): Promise<NativeLedgerRuntime<Actor>>;
};

export function createNativeLedgerHandler<Env extends NativeLedgerWorkerEnv, Actor = unknown>(options: NativeLedgerWorkerOptions<Env, Actor>) {
  return async (request: Request, env: Env): Promise<Response> => {
    const { pathname } = new URL(request.url);
    if (pathname === '/healthz') return Response.json({ status: 'ok' });
    if (!pathname.startsWith('/v1/')) return new Response('Not Found', { status: 404 });
    if (!request.headers.get('authorization')) return new Response('Unauthorized', { status: 401 });
    if (env.LEDGER_API_ENABLED !== 'true') return new Response('Service Unavailable', { status: 503 });

    try {
      const actor = await options.authenticate(env, request.headers);
      return await (await options.createRuntime(env)).handle(request, actor);
    } catch (error) {
      const response = nativeErrorResponse(error);
      if (response) return response;
      return new Response('Service Unavailable', { status: 503 });
    }
  };
}
