import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { Environment } from '../config.js';
import { DomainError } from '../domain/errors.js';
import type { LedgerRepository } from '../repositories/ledger-repository.js';
import { TransferService } from '../services/transfer-service.js';
import { FundingService, type WithdrawalFeePolicy } from '../services/funding-service.js';
import { createAuthenticator, requireRole } from './auth.js';
import { sendError } from './errors.js';

const transferBody = z.object({
  amount_atoms: z.string(),
  asset_code: z.string(),
  from_account_id: z.uuid(),
  to_account_id: z.uuid(),
}).strict();

const depositBody = z.object({
  amount_atoms: z.string(),
  asset_code: z.string(),
  block_hash: z.string(),
  block_height: z.string(),
  confirmation_count: z.number().int(),
  contract_identifier: z.string(),
  destination_account_id: z.uuid(),
  network: z.string(),
  output_index: z.number().int(),
  transaction_hash: z.string(),
}).strict();

const withdrawalBody = z.object({
  amount_atoms: z.string(),
  asset_code: z.string(),
  destination_address: z.string(),
  from_account_id: z.uuid(),
  frozen_account_id: z.uuid(),
  network: z.string(),
}).strict();

type BuildAppOptions = {
  developmentApiKey?: string;
  environment: Environment;
  logtoAudience?: string;
  logtoIssuer?: string;
  repository: LedgerRepository;
  withdrawalFeePolicy: WithdrawalFeePolicy;
};

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  const authenticate = createAuthenticator({
    environment: options.environment,
    developmentApiKey: options.developmentApiKey,
    host: '127.0.0.1',
    logtoAudience: options.logtoAudience,
    logtoIssuer: options.logtoIssuer,
    port: 3001,
    withdrawalFeeSchedule: {},
  });
  const transfers = new TransferService(options.repository);
  const funding = new FundingService(options.repository, options.withdrawalFeePolicy);

  app.setErrorHandler((error, _request, reply) => sendError(reply, error));

  app.get('/healthz', async () => ({ status: 'ok' }));

  app.get('/v1/accounts/:accountId/balances', async (request) => {
    const actor = await authenticate(request.headers);
    const params = z.object({ accountId: z.uuid() }).parse(request.params);
    const account = await options.repository.getAccount(params.accountId);
    if (account.ownerId !== actor.id) throw new DomainError('account_not_owned');
    const balances = await options.repository.getBalances(params.accountId);
    return { account_id: params.accountId, balances };
  });

  app.post('/v1/internal-transfers', async (request, reply) => {
    const actor = await authenticate(request.headers);
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string') throw new DomainError('invalid_idempotency_key');
    const body = transferBody.parse(request.body);
    const result = await transfers.transferInternal(actor.id, {
      amountAtoms: body.amount_atoms,
      assetCode: body.asset_code,
      fromAccountId: body.from_account_id,
      idempotencyKey,
      toAccountId: body.to_account_id,
    });
    reply.status(result.created ? 201 : 200);
    return { transfer_id: result.transferId, status: 'committed' };
  });

  app.post('/v1/deposits/confirmed', async (request, reply) => {
    const actor = await authenticate(request.headers);
    requireRole(actor, 'chain_worker');
    const body = depositBody.parse(request.body);
    const result = await funding.confirmDeposit(actor.id, {
      amountAtoms: body.amount_atoms,
      assetCode: body.asset_code,
      blockHash: body.block_hash,
      blockHeight: body.block_height,
      confirmationCount: body.confirmation_count,
      contractIdentifier: body.contract_identifier,
      destinationAccountId: body.destination_account_id,
      network: body.network,
      outputIndex: body.output_index,
      transactionHash: body.transaction_hash,
    });
    reply.status(result.created ? 201 : 200);
    return { deposit_id: result.depositId, ledger_transaction_id: result.transferId, status: 'credited' };
  });

  app.post('/v1/withdrawals', async (request, reply) => {
    const actor = await authenticate(request.headers);
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string') throw new DomainError('invalid_idempotency_key');
    const body = withdrawalBody.parse(request.body);
    const result = await funding.requestWithdrawal(actor.id, {
      amountAtoms: body.amount_atoms,
      assetCode: body.asset_code,
      destinationAddress: body.destination_address,
      fromAccountId: body.from_account_id,
      frozenAccountId: body.frozen_account_id,
      idempotencyKey,
      network: body.network,
    });
    reply.status(result.created ? 201 : 200);
    return { status: 'pending_review', withdrawal_id: result.withdrawalId };
  });

  app.post('/v1/withdrawals/:withdrawalId/approve', async (request) => {
    const actor = await authenticate(request.headers);
    requireRole(actor, 'finance_reviewer');
    const params = z.object({ withdrawalId: z.uuid() }).parse(request.params);
    const withdrawal = await options.repository.approveWithdrawal(params.withdrawalId, actor.id);
    return { status: withdrawal.status, withdrawal_id: withdrawal.id };
  });

  app.post('/v1/withdrawals/:withdrawalId/settle', async (request) => {
    const actor = await authenticate(request.headers);
    requireRole(actor, 'chain_worker');
    const params = z.object({ withdrawalId: z.uuid() }).parse(request.params);
    const body = z.object({ transaction_hash: z.string() }).strict().parse(request.body);
    const withdrawal = await options.repository.settleWithdrawal(params.withdrawalId, body.transaction_hash);
    return { status: withdrawal.status, withdrawal_id: withdrawal.id };
  });

  app.post('/v1/withdrawals/:withdrawalId/fail', async (request) => {
    const actor = await authenticate(request.headers);
    requireRole(actor, 'chain_worker');
    const params = z.object({ withdrawalId: z.uuid() }).parse(request.params);
    const body = z.object({ reason: z.string() }).strict().parse(request.body);
    const withdrawal = await options.repository.failWithdrawal(params.withdrawalId, body.reason);
    return { status: withdrawal.status, withdrawal_id: withdrawal.id };
  });

  return app;
}
