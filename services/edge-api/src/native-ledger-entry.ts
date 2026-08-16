import { createNativeLedgerHandler, type NativeLedgerWorkerEnv } from './native-ledger-worker.js';
import { authenticateChainOperator, authenticateNativeLedgerRequest, type NativeLedgerAuthEnv } from './native-ledger-auth.js';
import { createNativeLedgerRuntime } from './native-ledger-runtime.js';
import type { Actor } from '../../ledger-api/src/http/auth.js';

export interface Env extends NativeLedgerAuthEnv, NativeLedgerWorkerEnv {
  HYPERDRIVE: Hyperdrive;
  OPENBAO_TRANSIT_TOKEN?: string;
  OPENBAO_TRANSIT_URL?: string;
  DEPOSIT_SIGNER?: { fetch: typeof fetch };
  SIGNER_DERIVATION_URL?: string;
  SIGNER_SERVICE_TOKEN?: string;
  WITHDRAWAL_FEE_SCHEDULE?: string;
  WITHDRAWALS_ENABLED: string;
}

const handler = createNativeLedgerHandler<Env, Actor>({
  authenticate: async (env, headers, request) => {
    if (new URL(request.url).pathname === '/v1/deposits/confirmed') return authenticateChainOperator(env, headers);
    return authenticateNativeLedgerRequest(env, headers);
  },
  createRuntime: async (env) => createNativeLedgerRuntime(env),
});

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handler(request, env);
  },
};
