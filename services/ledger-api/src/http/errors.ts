import type { FastifyError, FastifyReply } from 'fastify';
import { ZodError } from 'zod';

import { DomainError } from '../domain/errors.js';

const statusByCode: Record<string, number> = {
  account_not_found: 404,
  account_not_owned: 403,
  account_unavailable: 409,
  asset_not_found: 404,
  idempotency_conflict: 409,
  insufficient_funds: 409,
  invalid_amount: 400,
  invalid_asset: 400,
  invalid_idempotency_key: 400,
  invalid_chain_transaction: 400,
  invalid_deposit: 400,
  invalid_destination_address: 400,
  invalid_network: 400,
  invalid_withdrawal_failure: 400,
  invalid_withdrawal_state: 409,
  platform_not_configured: 503,
  forbidden: 403,
  deposit_not_final: 409,
  deposit_observation_mismatch: 409,
  chain_asset_not_enabled: 409,
  same_account: 400,
  self_approval_forbidden: 403,
  unauthenticated: 401,
  withdrawal_not_found: 404,
};

export function sendError(reply: FastifyReply, error: unknown): void {
  if (error instanceof DomainError) {
    reply.status(statusByCode[error.code] ?? 400).send({ code: error.code, message: '請求無法處理' });
    return;
  }
  if (error instanceof ZodError) {
    reply.status(400).send({ code: 'invalid_request', message: '請求格式不正確' });
    return;
  }
  const requestId = reply.request.id;
  reply.log.error({ err: error as FastifyError, requestId }, 'unhandled request error');
  reply.status(500).send({ code: 'internal_error', message: '服務暫時無法處理請求', request_id: requestId });
}
