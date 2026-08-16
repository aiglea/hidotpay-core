type TimeoutFactory = { timeout?: (milliseconds: number) => AbortSignal };

export function boundRuntimeFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  return globalThis.fetch(input, init);
}

export function rpcTimeoutSignal(milliseconds: number, abortSignal: TimeoutFactory = AbortSignal): AbortSignal {
  if (typeof abortSignal.timeout === 'function') return abortSignal.timeout(milliseconds);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), milliseconds);
  return controller.signal;
}
