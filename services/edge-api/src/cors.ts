type CorsEnv = {
  CORS_ALLOWED_ORIGINS?: string;
};

const allowedMethods = 'GET, POST';
const allowedRequestHeaders = new Set(['authorization', 'content-type', 'idempotency-key']);

function allowedOrigins(env: CorsEnv): Set<string> {
  const origins = new Set<string>();
  for (const value of (env.CORS_ALLOWED_ORIGINS ?? '').split(',')) {
    try {
      const configuredOrigin = value.trim();
      const url = new URL(configuredOrigin);
      if (url.origin !== 'null' && configuredOrigin === url.origin) origins.add(url.origin);
    } catch {
      // An invalid deployment value never broadens browser access.
    }
  }
  return origins;
}

export function corsHeadersForRequest(request: Request, env: CorsEnv): Headers | null | undefined {
  const origin = request.headers.get('origin');
  if (!origin) return undefined;
  if (!allowedOrigins(env).has(origin)) return null;
  return new Headers({
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
    'Access-Control-Allow-Methods': allowedMethods,
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
  });
}

export function corsPreflightResponse(request: Request, corsHeaders: Headers | null | undefined): Response {
  if (!corsHeaders) return new Response('Forbidden', { status: 403 });
  const method = request.headers.get('access-control-request-method');
  const requestHeaders = (request.headers.get('access-control-request-headers') ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if ((method !== 'GET' && method !== 'POST') || requestHeaders.some((value) => !allowedRequestHeaders.has(value))) {
    return new Response('Forbidden', { status: 403 });
  }
  return new Response(null, { headers: corsHeaders, status: 204 });
}

export function withCors(response: Response, corsHeaders: Headers | null | undefined): Response {
  if (!corsHeaders) return response;
  const headers = new Headers(response.headers);
  corsHeaders.forEach((value, name) => headers.set(name, value));
  return new Response(response.body, { headers, status: response.status, statusText: response.statusText });
}
