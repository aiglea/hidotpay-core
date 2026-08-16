import { boundRuntimeFetch, rpcTimeoutSignal } from './rpc-timeout.js';

export type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export function httpsEndpoint(url: string): URL {
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash) {
    throw new Error('RPC URL must be HTTPS without credentials');
  }
  return endpoint;
}

export function runtimeFetch(configFetch?: Fetch): Fetch {
  return configFetch ?? boundRuntimeFetch;
}

export async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error('RPC request failed');
  return response.json();
}

export function timeoutInit(init: RequestInit = {}): RequestInit {
  return { ...init, signal: init.signal ?? rpcTimeoutSignal(10_000) };
}
