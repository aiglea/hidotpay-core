import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { Environment } from '../config.js';
import { DomainError } from '../domain/errors.js';
import { requestHash } from '../domain/idempotency.js';
import type { P2POrderAction, P2POrderStatus } from '../domain/p2p.js';
import type { LedgerRepository, WithdrawalRiskControls } from '../repositories/ledger-repository.js';
import type { WalletAddress } from '../repositories/postgres-wallet-address-repository.js';
import type { P2PAdRecord } from '../repositories/postgres-p2p-ad-repository.js';
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

const myTransferBody = z.object({
  amount_atoms: z.string(),
  asset_code: z.string(),
  recipient_wallet_id: z.uuid(),
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
  fee_quote_id: z.uuid(),
  from_account_id: z.uuid(),
  frozen_account_id: z.uuid(),
  network: z.string(),
}).strict();

const withdrawalFeeQuoteBody = z.object({
  amount_atoms: z.string(),
  asset_code: z.string(),
  network: z.string(),
}).strict();

const walletAddressBody = z.object({
  account_id: z.uuid(),
  network: z.string(),
}).strict();

const myWalletAddressBody = z.object({ network: z.string() }).strict();
const walletTransactionQuery = z.object({
  cursor: z.string().min(1).max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();
const p2pAdBody = z.object({ asset_code: z.string(), fiat_currency: z.string(), max_amount_atoms: z.string(), min_amount_atoms: z.string(), payment_method_code: z.string(), price_atoms: z.string() }).strict();
const p2pOrderBody = z.object({ ad_id: z.uuid(), amount_atoms: z.string() }).strict();
const p2pOrderIdParams = z.object({ orderId: z.uuid() });
const p2pDisputeBody = z.object({ reason_code: z.string() }).strict();
const p2pResolutionBody = z.object({ outcome: z.enum(['release_to_buyer', 'refund_to_seller']) }).strict();
const p2pPaymentMethodBody = z.object({ account_holder_name: z.string(), account_payload: z.string().min(1).max(2000), currency: z.string(), method_code: z.enum(['bank_transfer', 'e_wallet']) }).strict();

type WalletAddressAllocator = {
  allocate(input: { accountId: string; network: string; ownerId: string }): Promise<WalletAddress>;
};
type P2PAds = { create(input: { assetCode: string; fiatCurrency: string; maxAmountAtoms: string; minAmountAtoms: string; paymentMethodCode: string; priceAtoms: string; sellerId: string }): Promise<P2PAdRecord>; listActive(): Promise<P2PAdRecord[]> };
type P2POrderRecord = {
  adId: string; amountAtoms: string; assetCode: string; buyerId: string; escrowAccountId: string; fiatCurrency: string; id: string;
  paymentDeadlineAt: string; paymentMethodCode: string; priceAtoms: string; sellerAvailableAccountId: string; sellerId: string; status: P2POrderStatus;
};
type P2POrders = {
  create(input: { adId: string; amountAtoms: string; buyerId: string; idempotencyKey: string; requestHash: string }): Promise<P2POrderRecord>;
  listForActor(actorId: string): Promise<P2POrderRecord[]>;
  transition(input: { action: P2POrderAction; actorId: string; idempotencyKey: string; orderId: string; reasonCode?: string; requestHash: string }): Promise<P2POrderRecord>;
};
type P2PPaymentMethodRecord = { accountHolderName: string; currency: string; id: string; maskedReference: string; methodCode: 'bank_transfer' | 'e_wallet'; ownerId: string; status: 'pending_review' | 'active' | 'rejected' | 'disabled' };
type P2PPaymentMethods = {
  create(input: { accountHolderName: string; accountPayload: string; currency: string; methodCode: 'bank_transfer' | 'e_wallet'; ownerId: string }): Promise<P2PPaymentMethodRecord>;
  listForOwner(ownerId: string): Promise<P2PPaymentMethodRecord[]>;
};

type BuildAppOptions = {
  developmentApiKey?: string;
  environment: Environment;
  logtoAudience?: string;
  logtoIssuer?: string;
  repository: LedgerRepository;
  p2pAds?: P2PAds;
  p2pOrders?: P2POrders;
  p2pPaymentMethods?: P2PPaymentMethods;
  walletAddresses?: WalletAddressAllocator;
  withdrawalFeePolicy: WithdrawalFeePolicy;
  withdrawalRiskControls?: WithdrawalRiskControls;
  withdrawalsEnabled?: boolean;
};

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  const authenticate = createAuthenticator({
    environment: options.environment,
    developmentApiKey: options.developmentApiKey,
    logtoAudience: options.logtoAudience,
    logtoIssuer: options.logtoIssuer,
  });
  const transfers = new TransferService(options.repository);
  const funding = new FundingService(options.repository, options.withdrawalFeePolicy, {
    riskControls: options.withdrawalRiskControls,
    withdrawalsEnabled: options.withdrawalsEnabled,
  });

  app.setErrorHandler((error, _request, reply) => sendError(reply, error));

  app.get('/healthz', async () => ({ status: 'ok', ok: true, service: 'hidotpay-ledger-api' }));

  app.get('/', async () => ({ service: 'hidotpay-ledger-api', status: 'ok' }));

  if (options.p2pAds) {
    app.get('/v1/p2p/ads', async () => ({ ads: await options.p2pAds!.listActive() }));
    app.post('/v1/p2p/ads', async (request, reply) => {
      const actor = await authenticate(request.headers);
      const body = p2pAdBody.parse(request.body);
      const ad = await options.p2pAds!.create({ assetCode: body.asset_code, fiatCurrency: body.fiat_currency, maxAmountAtoms: body.max_amount_atoms, minAmountAtoms: body.min_amount_atoms, paymentMethodCode: body.payment_method_code, priceAtoms: body.price_atoms, sellerId: actor.id });
      reply.status(201);
      return { ad };
    });
  }

  if (options.p2pOrders) {
    const transitionP2POrder = async (request: FastifyRequest, action: P2POrderAction, reasonCode?: string): Promise<{ order: P2POrderRecord }> => {
      const actor = await authenticate(request.headers);
      const idempotencyKey = request.headers['idempotency-key'];
      if (typeof idempotencyKey !== 'string') throw new DomainError('invalid_idempotency_key');
      const params = p2pOrderIdParams.parse(request.params);
      const order = await options.p2pOrders!.transition({
        action,
        actorId: actor.id,
        idempotencyKey,
        orderId: params.orderId,
        ...(reasonCode ? { reasonCode } : {}),
        requestHash: requestHash({ action, order_id: params.orderId, ...(reasonCode ? { reason_code: reasonCode } : {}) }),
      });
      return { order };
    };
    app.get('/v1/p2p/orders', async (request) => {
      const actor = await authenticate(request.headers);
      return { orders: await options.p2pOrders!.listForActor(actor.id) };
    });
    app.post('/v1/p2p/orders', async (request, reply) => {
      const actor = await authenticate(request.headers);
      const idempotencyKey = request.headers['idempotency-key'];
      if (typeof idempotencyKey !== 'string') throw new DomainError('invalid_idempotency_key');
      const body = p2pOrderBody.parse(request.body);
      const order = await options.p2pOrders!.create({
        adId: body.ad_id,
        amountAtoms: body.amount_atoms,
        buyerId: actor.id,
        idempotencyKey,
        requestHash: requestHash({ ad_id: body.ad_id, amount_atoms: body.amount_atoms }),
      });
      reply.status(201);
      return { order };
    });
    app.post('/v1/p2p/orders/:orderId/mark-paid', async (request) => transitionP2POrder(request, 'buyer_marked_paid'));
    app.post('/v1/p2p/orders/:orderId/cancel', async (request) => transitionP2POrder(request, 'seller_cancel'));
    app.post('/v1/p2p/orders/:orderId/release', async (request) => transitionP2POrder(request, 'seller_release'));
    app.post('/v1/p2p/orders/:orderId/disputes', async (request) => {
      const body = p2pDisputeBody.parse(request.body);
      return transitionP2POrder(request, 'open_dispute', body.reason_code);
    });
    app.post('/v1/p2p/orders/:orderId/resolution', async (request) => {
      const actor = await authenticate(request.headers);
      requireRole(actor, 'p2p_arbitrator');
      const body = p2pResolutionBody.parse(request.body);
      return transitionP2POrder(request, body.outcome === 'release_to_buyer' ? 'arbitrator_release_buyer' : 'arbitrator_refund_seller');
    });
  }

  if (options.p2pPaymentMethods) {
    app.get('/v1/me/p2p/payment-methods', async (request) => {
      const actor = await authenticate(request.headers);
      return { payment_methods: await options.p2pPaymentMethods!.listForOwner(actor.id) };
    });
    app.post('/v1/me/p2p/payment-methods', async (request, reply) => {
      const actor = await authenticate(request.headers);
      const body = p2pPaymentMethodBody.parse(request.body);
      const paymentMethod = await options.p2pPaymentMethods!.create({ accountHolderName: body.account_holder_name, accountPayload: body.account_payload, currency: body.currency, methodCode: body.method_code, ownerId: actor.id });
      reply.status(201);
      return { payment_method: paymentMethod };
    });
  }

  app.get('/v1/me/wallet', async (request) => {
    const actor = await authenticate(request.headers);
    const wallet = await options.repository.ensureUserWallet(actor.id);
    return {
      available_account_id: wallet.availableAccount.id,
      frozen_account_id: wallet.frozenAccount.id,
      status: wallet.availableAccount.status,
    };
  });

  app.get('/v1/me/balances', async (request) => {
    const actor = await authenticate(request.headers);
    const wallet = await options.repository.ensureUserWallet(actor.id);
    const balances = await options.repository.getBalances(wallet.availableAccount.id);
    return { account_id: wallet.availableAccount.id, balances };
  });

  app.get('/v1/me/transactions', async (request) => {
    const actor = await authenticate(request.headers);
    const page = walletTransactionQuery.parse(request.query);
    const wallet = await options.repository.ensureUserWallet(actor.id);
    const result = await options.repository.listWalletTransactions(wallet.availableAccount.id, page);
    return {
      transactions: result.transactions.map((transaction) => ({
        id: transaction.id,
        type: transaction.type,
        asset_code: transaction.assetCode,
        amount_atoms: transaction.amountAtoms,
        direction: transaction.direction,
        created_at: transaction.createdAt,
      })),
      next_cursor: result.nextCursor ?? null,
    };
  });

  if (options.walletAddresses) {
    app.post('/v1/me/wallet-addresses', async (request) => {
      const actor = await authenticate(request.headers);
      const body = myWalletAddressBody.parse(request.body);
      const wallet = await options.repository.ensureUserWallet(actor.id);
      const address = await options.walletAddresses!.allocate({ accountId: wallet.availableAccount.id, network: body.network, ownerId: actor.id });
      return {
        address: address.address,
        key_version: address.keyVersion,
        network: address.network,
      };
    });

    app.post('/v1/wallet-addresses', async (request) => {
      const actor = await authenticate(request.headers);
      const body = walletAddressBody.parse(request.body);
      const account = await options.repository.getAccount(body.account_id);
      if (account.ownerId !== actor.id) throw new DomainError('account_not_owned');
      const address = await options.walletAddresses!.allocate({ accountId: body.account_id, network: body.network, ownerId: actor.id });
      return {
        account_id: address.accountId,
        address: address.address,
        key_version: address.keyVersion,
        network: address.network,
      };
    });
  }

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

  app.post('/v1/me/internal-transfers', async (request, reply) => {
    const actor = await authenticate(request.headers);
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string') throw new DomainError('invalid_idempotency_key');
    const body = myTransferBody.parse(request.body);
    const wallet = await options.repository.ensureUserWallet(actor.id);
    const result = await transfers.transferInternal(actor.id, {
      amountAtoms: body.amount_atoms,
      assetCode: body.asset_code,
      fromAccountId: wallet.availableAccount.id,
      idempotencyKey,
      toAccountId: body.recipient_wallet_id,
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
      feeQuoteId: body.fee_quote_id,
      fromAccountId: body.from_account_id,
      frozenAccountId: body.frozen_account_id,
      idempotencyKey,
      network: body.network,
    });
    reply.status(result.created ? 201 : 200);
    return { status: 'pending_review', withdrawal_id: result.withdrawalId };
  });

  app.post('/v1/withdrawal-fee-quotes', async (request, reply) => {
    const actor = await authenticate(request.headers);
    const body = withdrawalFeeQuoteBody.parse(request.body);
    const quote = await funding.quoteWithdrawalFee(actor.id, {
      amountAtoms: body.amount_atoms,
      assetCode: body.asset_code,
      network: body.network,
    });
    reply.status(201);
    return { expires_at: quote.expiresAt, fee_atoms: quote.feeAtoms, fee_quote_id: quote.id };
  });

  app.post('/v1/withdrawals/:withdrawalId/approve', async (request) => {
    const actor = await authenticate(request.headers);
    requireRole(actor, 'finance_reviewer');
    const params = z.object({ withdrawalId: z.uuid() }).parse(request.params);
    const withdrawal = await options.repository.approveWithdrawal(params.withdrawalId, actor.id);
    return { status: withdrawal.status, withdrawal_id: withdrawal.id };
  });

  return app;
}
