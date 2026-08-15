import { createDepositSignerWorker, type DepositSignerEnv } from './deposit-signer-worker.js';

export default {
  async fetch(request: Request, env: DepositSignerEnv): Promise<Response> {
    return createDepositSignerWorker(env).fetch(request);
  },
};
