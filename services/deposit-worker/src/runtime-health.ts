import { createServer, type Server } from 'node:http';

export type DepositWorkerHealthServer = { markReady(): void; markStopping(): void; markUnready(): void; server: Server };

/** Private probe only; no chain, account, RPC, or credential values are exposed. */
export function createDepositWorkerHealthServer(): DepositWorkerHealthServer {
  let ready = false;
  let stopping = false;
  const server = createServer((request, response) => {
    const path = request.url?.split('?', 1)[0];
    const healthy = path === '/health/live' ? !stopping : path === '/health/ready' ? ready && !stopping : undefined;
    if (healthy === undefined) { response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); response.end('not found\n'); return; }
    response.writeHead(healthy ? 200 : 503, { 'content-type': 'text/plain; charset=utf-8' }); response.end(healthy ? 'ok\n' : 'unavailable\n');
  });
  return { markReady: () => { if (!stopping) ready = true; }, markStopping: () => { stopping = true; ready = false; }, markUnready: () => { ready = false; }, server };
}
