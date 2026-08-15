import { createServer, type Server } from 'node:http';

export type ReconciliationHealthServer = {
  markReady(): void;
  markStopping(): void;
  server: Server;
};

/** This private probe contains no financial, Blnk, or signer information. */
export function createReconciliationHealthServer(): ReconciliationHealthServer {
  let ready = false;
  let stopping = false;
  const server = createServer((request, response) => {
    const path = request.url?.split('?', 1)[0];
    const healthy = path === '/health/live' ? !stopping : path === '/health/ready' ? ready && !stopping : undefined;
    if (healthy === undefined) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('not found\n');
      return;
    }
    response.writeHead(healthy ? 200 : 503, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(healthy ? 'ok\n' : 'unavailable\n');
  });
  return {
    markReady: () => { ready = true; },
    markStopping: () => { stopping = true; ready = false; },
    server,
  };
}
