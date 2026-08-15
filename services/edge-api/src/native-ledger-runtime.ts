import { Pool } from 'pg';

import type { Actor } from '../../ledger-api/src/http/auth.js';
import { DomainError } from '../../ledger-api/src/domain/errors.js';
import { isValidIdempotencyKey, requestHash } from '../../ledger-api/src/domain/idempotency.js';
import type { P2POrderAction } from '../../ledger-api/src/domain/p2p.js';
import { decodeWalletTransactionCursor } from '../../ledger-api/src/domain/wallet-transaction-cursor.js';
import { OpenBaoP2PPaymentCryptographer } from '../../ledger-api/src/integrations/openbao-p2p-payment-cryptographer.js';
import { RemoteSignerAddressDeriver } from '../../ledger-api/src/integrations/signer-address-deriver.js';
import { PostgresLedgerRepository } from '../../ledger-api/src/repositories/postgres-ledger-repository.js';
import type { LedgerRepository } from '../../ledger-api/src/repositories/ledger-repository.js';
import { PostgresP2PAdRepository, type P2PAdRecord } from '../../ledger-api/src/repositories/postgres-p2p-ad-repository.js';
import { PostgresP2POrderRepository } from '../../ledger-api/src/repositories/postgres-p2p-order-repository.js';
import { PostgresP2PPaymentMethodRepository } from '../../ledger-api/src/repositories/postgres-p2p-payment-method-repository.js';
import { PostgresWalletAddressRepository } from '../../ledger-api/src/repositories/postgres-wallet-address-repository.js';
import { FundingService, fixedWithdrawalFeePolicy, type WithdrawalFeePolicy } from '../../ledger-api/src/services/funding-service.js';
import { TransferService } from '../../ledger-api/src/services/transfer-service.js';
import type { NativeLedgerRuntime } from './native-ledger-worker.js';

export type NativeLedgerRuntimeEnv = {
  DEPOSIT_SIGNER?: { fetch: typeof fetch };
  HYPERDRIVE: Hyperdrive;
  OPENBAO_TRANSIT_TOKEN?: string;
  OPENBAO_TRANSIT_URL?: string;
  SIGNER_DERIVATION_URL?: string;
  SIGNER_SERVICE_TOKEN?: string;
  WITHDRAWAL_FEE_SCHEDULE?: string;
};

export type ReadOnlyWalletRepository = Pick<LedgerRepository, 'ensureUserWallet' | 'getAccount' | 'getBalances' | 'listWalletTransactions'>;
export type InternalTransferRepository = Pick<LedgerRepository, 'ensureUserWallet' | 'transferInternal'>;
export type WithdrawalFeeQuoteRepository = Pick<LedgerRepository, 'createWithdrawalFeeQuote'>;
export type P2PAdsRepository = Pick<PostgresP2PAdRepository, 'create' | 'listActive'>;
export type P2POrdersRepository = Pick<PostgresP2POrderRepository, 'create' | 'listForActor'>;
export type P2POrderActionsRepository = Pick<PostgresP2POrderRepository, 'transition'>;
export type P2PPaymentMethodsRepository = Pick<PostgresP2PPaymentMethodRepository, 'create' | 'listForOwner'>;
export type WalletAddressOwnerRepository = Pick<LedgerRepository, 'ensureUserWallet' | 'getAccount'>;
export type WalletAddressAllocator = Pick<PostgresWalletAddressRepository, 'allocate'>;

function invalidRequest(): Response {
  return Response.json({ code: 'invalid_request', message: '請求格式不正確' }, { status: 400 });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function walletTransactionPageFromRequest(request: Request): { page: { cursor?: string; limit: number } } | { error: Response } {
  const search = new URL(request.url).searchParams;
  const allowedKeys = new Set(['cursor', 'limit']);
  for (const key of search.keys()) {
    if (!allowedKeys.has(key) || search.getAll(key).length !== 1) return { error: invalidRequest() };
  }

  const cursor = search.get('cursor');
  if (cursor !== null) {
    if (cursor.length < 1 || cursor.length > 1024) return { error: invalidRequest() };
    try {
      decodeWalletTransactionCursor(cursor);
    } catch {
      return { error: Response.json({ code: 'invalid_wallet_transaction_cursor', message: '請求無法處理' }, { status: 400 }) };
    }
  }

  const limitValue = search.get('limit');
  const limit = limitValue === null ? 20 : Number(limitValue);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return { error: invalidRequest() };
  return { page: cursor === null ? { limit } : { cursor, limit } };
}

export function createReadOnlyWalletRouter(repository: ReadOnlyWalletRepository): NativeLedgerRuntime<Actor> {
  return {
    async handle(request: Request, actor: Actor): Promise<Response> {
      const { pathname } = new URL(request.url);
      if (request.method !== 'GET') return new Response('Not Found', { status: 404 });
      if (pathname === '/v1/me/wallet') {
        const wallet = await repository.ensureUserWallet(actor.id);
        return Response.json({
          available_account_id: wallet.availableAccount.id,
          frozen_account_id: wallet.frozenAccount.id,
          status: wallet.availableAccount.status,
        });
      }
      if (pathname === '/v1/me/balances') {
        const wallet = await repository.ensureUserWallet(actor.id);
        const balances = await repository.getBalances(wallet.availableAccount.id);
        return Response.json({ account_id: wallet.availableAccount.id, balances });
      }
      if (pathname === '/v1/me/transactions') {
        const pageResult = walletTransactionPageFromRequest(request);
        if ('error' in pageResult) return pageResult.error;
        const wallet = await repository.ensureUserWallet(actor.id);
        const result = await repository.listWalletTransactions(wallet.availableAccount.id, pageResult.page);
        return Response.json({
          transactions: result.transactions.map((transaction) => ({
            id: transaction.id,
            type: transaction.type,
            asset_code: transaction.assetCode,
            amount_atoms: transaction.amountAtoms,
            direction: transaction.direction,
            created_at: transaction.createdAt,
          })),
          next_cursor: result.nextCursor ?? null,
        });
      }

      const accountMatch = /^\/v1\/accounts\/([^/]+)\/balances$/.exec(pathname);
      if (!accountMatch) return new Response('Not Found', { status: 404 });
      const accountId = accountMatch[1]!;
      if (!isUuid(accountId)) return invalidRequest();
      const account = await repository.getAccount(accountId);
      if (account.ownerId !== actor.id) return Response.json({ code: 'account_not_owned', message: '請求無法處理' }, { status: 403 });
      const balances = await repository.getBalances(accountId);
      return Response.json({ account_id: accountId, balances });
    },
  };
}

function isInternalTransferBody(value: unknown): value is {
  amount_atoms: string;
  asset_code: string;
  recipient_wallet_id: string;
} {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  return keys.length === 3
    && keys.every((key) => key === 'amount_atoms' || key === 'asset_code' || key === 'recipient_wallet_id')
    && typeof body.amount_atoms === 'string'
    && typeof body.asset_code === 'string'
    && typeof body.recipient_wallet_id === 'string'
    && isUuid(body.recipient_wallet_id);
}

function isDirectInternalTransferBody(value: unknown): value is {
  amount_atoms: string;
  asset_code: string;
  from_account_id: string;
  to_account_id: string;
} {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  return keys.length === 4
    && keys.every((key) => key === 'amount_atoms' || key === 'asset_code' || key === 'from_account_id' || key === 'to_account_id')
    && typeof body.amount_atoms === 'string'
    && typeof body.asset_code === 'string'
    && typeof body.from_account_id === 'string'
    && typeof body.to_account_id === 'string'
    && isUuid(body.from_account_id)
    && isUuid(body.to_account_id);
}

function isWithdrawalFeeQuoteBody(value: unknown): value is {
  amount_atoms: string;
  asset_code: string;
  network: string;
} {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  return keys.length === 3
    && keys.every((key) => key === 'amount_atoms' || key === 'asset_code' || key === 'network')
    && typeof body.amount_atoms === 'string'
    && typeof body.asset_code === 'string'
    && typeof body.network === 'string';
}

function isP2PAdBody(value: unknown): value is {
  asset_code: string;
  fiat_currency: string;
  max_amount_atoms: string;
  min_amount_atoms: string;
  payment_method_code: string;
  price_atoms: string;
} {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  return keys.length === 6
    && keys.every((key) => key === 'asset_code' || key === 'fiat_currency' || key === 'max_amount_atoms' || key === 'min_amount_atoms' || key === 'payment_method_code' || key === 'price_atoms')
    && typeof body.asset_code === 'string'
    && typeof body.fiat_currency === 'string'
    && typeof body.max_amount_atoms === 'string'
    && typeof body.min_amount_atoms === 'string'
    && typeof body.payment_method_code === 'string'
    && typeof body.price_atoms === 'string';
}

function isP2POrderBody(value: unknown): value is { ad_id: string; amount_atoms: string } {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  return keys.length === 2
    && keys.every((key) => key === 'ad_id' || key === 'amount_atoms')
    && typeof body.ad_id === 'string'
    && isUuid(body.ad_id)
    && typeof body.amount_atoms === 'string';
}

function isP2PDisputeBody(value: unknown): value is { reason_code: string } {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  return Object.keys(body).length === 1 && typeof body.reason_code === 'string';
}

function isP2PResolutionBody(value: unknown): value is { outcome: 'refund_to_seller' | 'release_to_buyer' } {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  return Object.keys(body).length === 1 && (body.outcome === 'release_to_buyer' || body.outcome === 'refund_to_seller');
}

function isP2PPaymentMethodBody(value: unknown): value is {
  account_holder_name: string;
  account_payload: string;
  currency: string;
  method_code: 'bank_transfer' | 'e_wallet';
} {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  return keys.length === 4
    && keys.every((key) => key === 'account_holder_name' || key === 'account_payload' || key === 'currency' || key === 'method_code')
    && typeof body.account_holder_name === 'string'
    && typeof body.account_payload === 'string'
    && typeof body.currency === 'string'
    && (body.method_code === 'bank_transfer' || body.method_code === 'e_wallet');
}

function isNetworkBody(value: unknown): value is { network: string } {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  return Object.keys(body).length === 1 && typeof body.network === 'string';
}

function withdrawalFeePolicyFromEnv(value: string | undefined): WithdrawalFeePolicy {
  if (!value) throw new Error('Withdrawal fee schedule is unavailable');
  let schedule: unknown;
  try {
    schedule = JSON.parse(value);
  } catch {
    throw new Error('Withdrawal fee schedule is invalid');
  }
  if (!schedule || Array.isArray(schedule) || typeof schedule !== 'object') throw new Error('Withdrawal fee schedule is invalid');
  for (const [key, amount] of Object.entries(schedule)) {
    if (!/^[A-Za-z0-9._:-]{2,80}$/.test(key) || typeof amount !== 'string' || !/^[0-9]+$/.test(amount)) {
      throw new Error('Withdrawal fee schedule is invalid');
    }
  }
  return fixedWithdrawalFeePolicy(schedule as Record<string, string>);
}

export function createInternalTransferRouter(repository: InternalTransferRepository): NativeLedgerRuntime<Actor> {
  const transfers = new TransferService(repository);

  return {
    async handle(request: Request, actor: Actor): Promise<Response> {
      const { pathname } = new URL(request.url);
      if (request.method !== 'POST' || (pathname !== '/v1/me/internal-transfers' && pathname !== '/v1/internal-transfers')) {
        return new Response('Not Found', { status: 404 });
      }
      const idempotencyKey = request.headers.get('idempotency-key');
      if (!idempotencyKey || !isValidIdempotencyKey(idempotencyKey)) {
        return Response.json({ code: 'invalid_idempotency_key', message: '請求無法處理' }, { status: 400 });
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return invalidRequest();
      }
      if (pathname === '/v1/internal-transfers') {
        if (!isDirectInternalTransferBody(body)) return invalidRequest();
        const result = await transfers.transferInternal(actor.id, {
          amountAtoms: body.amount_atoms,
          assetCode: body.asset_code,
          fromAccountId: body.from_account_id,
          idempotencyKey,
          toAccountId: body.to_account_id,
        });
        return Response.json({ status: 'committed', transfer_id: result.transferId }, { status: result.created ? 201 : 200 });
      }

      if (!isInternalTransferBody(body)) return invalidRequest();

      const wallet = await repository.ensureUserWallet(actor.id);
      const result = await transfers.transferInternal(actor.id, {
        amountAtoms: body.amount_atoms,
        assetCode: body.asset_code,
        fromAccountId: wallet.availableAccount.id,
        idempotencyKey,
        toAccountId: body.recipient_wallet_id,
      });
      return Response.json({ status: 'committed', transfer_id: result.transferId }, { status: result.created ? 201 : 200 });
    },
  };
}

export function createWithdrawalFeeQuoteRouter(
  repository: WithdrawalFeeQuoteRepository,
  withdrawalFeePolicy: WithdrawalFeePolicy,
): NativeLedgerRuntime<Actor> {
  const funding = new FundingService({
    confirmDeposit: async () => {
      throw new Error('Deposit confirmation is not available from the fee quote route');
    },
    createWithdrawalFeeQuote: (input) => repository.createWithdrawalFeeQuote(input),
    requestWithdrawal: async () => {
      throw new Error('Withdrawal requests are not available from the fee quote route');
    },
  }, withdrawalFeePolicy);
  return {
    async handle(request: Request, actor: Actor): Promise<Response> {
      if (request.method !== 'POST' || new URL(request.url).pathname !== '/v1/withdrawal-fee-quotes') {
        return new Response('Not Found', { status: 404 });
      }
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return invalidRequest();
      }
      if (!isWithdrawalFeeQuoteBody(body)) return invalidRequest();
      const quote = await funding.quoteWithdrawalFee(actor.id, {
        amountAtoms: body.amount_atoms,
        assetCode: body.asset_code,
        network: body.network,
      });
      return Response.json({
        expires_at: quote.expiresAt,
        fee_atoms: quote.feeAtoms,
        fee_quote_id: quote.id,
      }, { status: 201 });
    },
  };
}

export function createP2PAdsRouter(repository: P2PAdsRepository): NativeLedgerRuntime<Actor> {
  return {
    async handle(request: Request, actor: Actor): Promise<Response> {
      if (new URL(request.url).pathname !== '/v1/p2p/ads') return new Response('Not Found', { status: 404 });
      if (request.method === 'GET') return Response.json({ ads: await repository.listActive() });
      if (request.method !== 'POST') return new Response('Not Found', { status: 404 });
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return invalidRequest();
      }
      if (!isP2PAdBody(body)) return invalidRequest();
      const ad: P2PAdRecord = await repository.create({
        assetCode: body.asset_code,
        fiatCurrency: body.fiat_currency,
        maxAmountAtoms: body.max_amount_atoms,
        minAmountAtoms: body.min_amount_atoms,
        paymentMethodCode: body.payment_method_code,
        priceAtoms: body.price_atoms,
        sellerId: actor.id,
      });
      return Response.json({ ad }, { status: 201 });
    },
  };
}

export function createP2POrdersRouter(repository: P2POrdersRepository): NativeLedgerRuntime<Actor> {
  return {
    async handle(request: Request, actor: Actor): Promise<Response> {
      if (new URL(request.url).pathname !== '/v1/p2p/orders') return new Response('Not Found', { status: 404 });
      if (request.method === 'GET') return Response.json({ orders: await repository.listForActor(actor.id) });
      if (request.method !== 'POST') return new Response('Not Found', { status: 404 });
      const idempotencyKey = request.headers.get('idempotency-key');
      if (!idempotencyKey || !isValidIdempotencyKey(idempotencyKey)) {
        return Response.json({ code: 'invalid_idempotency_key', message: '請求無法處理' }, { status: 400 });
      }
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return invalidRequest();
      }
      if (!isP2POrderBody(body)) return invalidRequest();
      const order = await repository.create({
        adId: body.ad_id,
        amountAtoms: body.amount_atoms,
        buyerId: actor.id,
        idempotencyKey,
        requestHash: requestHash({ ad_id: body.ad_id, amount_atoms: body.amount_atoms }),
      });
      return Response.json({ order }, { status: 201 });
    },
  };
}

export function createP2POrderActionsRouter(repository: P2POrderActionsRepository): NativeLedgerRuntime<Actor> {
  return {
    async handle(request: Request, actor: Actor): Promise<Response> {
      if (request.method !== 'POST') return new Response('Not Found', { status: 404 });
      const match = /^\/v1\/p2p\/orders\/([^/]+)\/(mark-paid|cancel|release|disputes|resolution)$/.exec(new URL(request.url).pathname);
      if (!match) return new Response('Not Found', { status: 404 });
      const orderId = match[1]!;
      const routeAction = match[2]!;
      if (!isUuid(orderId)) return invalidRequest();
      const idempotencyKey = request.headers.get('idempotency-key');
      if (!idempotencyKey || !isValidIdempotencyKey(idempotencyKey)) {
        return Response.json({ code: 'invalid_idempotency_key', message: '請求無法處理' }, { status: 400 });
      }

      let action: P2POrderAction;
      let reasonCode: string | undefined;
      if (routeAction === 'mark-paid') action = 'buyer_marked_paid';
      else if (routeAction === 'cancel') action = 'seller_cancel';
      else if (routeAction === 'release') action = 'seller_release';
      else if (routeAction === 'disputes') {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return invalidRequest();
        }
        if (!isP2PDisputeBody(body)) return invalidRequest();
        action = 'open_dispute';
        reasonCode = body.reason_code;
      } else {
        if (!actor.roles.includes('p2p_arbitrator')) {
          return Response.json({ code: 'forbidden', message: '請求無法處理' }, { status: 403 });
        }
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return invalidRequest();
        }
        if (!isP2PResolutionBody(body)) return invalidRequest();
        action = body.outcome === 'release_to_buyer' ? 'arbitrator_release_buyer' : 'arbitrator_refund_seller';
      }

      const order = await repository.transition({
        action,
        actorId: actor.id,
        idempotencyKey,
        orderId,
        ...(reasonCode ? { reasonCode } : {}),
        requestHash: requestHash({ action, order_id: orderId, ...(reasonCode ? { reason_code: reasonCode } : {}) }),
      });
      return Response.json({ order });
    },
  };
}

export function createP2PPaymentMethodsRouter(repository: P2PPaymentMethodsRepository): NativeLedgerRuntime<Actor> {
  return {
    async handle(request: Request, actor: Actor): Promise<Response> {
      if (new URL(request.url).pathname !== '/v1/me/p2p/payment-methods') return new Response('Not Found', { status: 404 });
      if (request.method === 'GET') return Response.json({ payment_methods: await repository.listForOwner(actor.id) });
      if (request.method !== 'POST') return new Response('Not Found', { status: 404 });
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return invalidRequest();
      }
      if (!isP2PPaymentMethodBody(body)) return invalidRequest();
      const paymentMethod = await repository.create({
        accountHolderName: body.account_holder_name,
        accountPayload: body.account_payload,
        currency: body.currency,
        methodCode: body.method_code,
        ownerId: actor.id,
      });
      return Response.json({ payment_method: paymentMethod }, { status: 201 });
    },
  };
}

export function createWalletAddressRouter(
  repository: WalletAddressOwnerRepository,
  walletAddresses: WalletAddressAllocator,
): NativeLedgerRuntime<Actor> {
  return {
    async handle(request: Request, actor: Actor): Promise<Response> {
      if (request.method !== 'POST') return new Response('Not Found', { status: 404 });
      const pathname = new URL(request.url).pathname;
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return invalidRequest();
      }
      if (pathname === '/v1/me/wallet-addresses') {
        if (!isNetworkBody(body)) return invalidRequest();
        const wallet = await repository.ensureUserWallet(actor.id);
        const address = await walletAddresses.allocate({ accountId: wallet.availableAccount.id, network: body.network, ownerId: actor.id });
        return Response.json({ address: address.address, key_version: address.keyVersion, network: address.network });
      }
      if (pathname !== '/v1/wallet-addresses' || !body || typeof body !== 'object') return new Response('Not Found', { status: 404 });
      const direct = body as Record<string, unknown>;
      if (Object.keys(direct).length !== 2 || typeof direct.account_id !== 'string' || !isUuid(direct.account_id) || typeof direct.network !== 'string') {
        return invalidRequest();
      }
      const account = await repository.getAccount(direct.account_id);
      if (account.ownerId !== actor.id) return Response.json({ code: 'account_not_owned', message: '請求無法處理' }, { status: 403 });
      const address = await walletAddresses.allocate({ accountId: direct.account_id, network: direct.network, ownerId: actor.id });
      return Response.json({ account_id: address.accountId, address: address.address, key_version: address.keyVersion, network: address.network });
    },
  };
}

export function signerAddressDeriverFromEnv(env: Pick<NativeLedgerRuntimeEnv, 'DEPOSIT_SIGNER' | 'SIGNER_DERIVATION_URL' | 'SIGNER_SERVICE_TOKEN'>): RemoteSignerAddressDeriver {
  if (!env.SIGNER_SERVICE_TOKEN) throw new DomainError('signer_unavailable');
  const fetchImpl = env.DEPOSIT_SIGNER ? env.DEPOSIT_SIGNER.fetch.bind(env.DEPOSIT_SIGNER) : undefined;
  if (!fetchImpl && !env.SIGNER_DERIVATION_URL) throw new DomainError('signer_unavailable');
  return new RemoteSignerAddressDeriver({
    fetchImpl,
    serviceToken: env.SIGNER_SERVICE_TOKEN,
    url: env.SIGNER_DERIVATION_URL ?? 'https://deposit-signer.internal/v1/deposit-addresses',
  });
}

export function createNativeLedgerRuntime(env: NativeLedgerRuntimeEnv): NativeLedgerRuntime<Actor> {
  if (!env.HYPERDRIVE.connectionString) throw new Error('Hyperdrive connection is unavailable');

  return {
    async handle(request: Request, actor: Actor): Promise<Response> {
      const pool = new Pool({ connectionString: env.HYPERDRIVE.connectionString });
      try {
        const repository = new PostgresLedgerRepository(pool);
        const pathname = new URL(request.url).pathname;
        if (request.method === 'POST' && (pathname === '/v1/me/internal-transfers' || pathname === '/v1/internal-transfers')) {
          return await createInternalTransferRouter(repository).handle(request, actor);
        }
        if (request.method === 'POST' && pathname === '/v1/withdrawal-fee-quotes') {
          return await createWithdrawalFeeQuoteRouter(repository, withdrawalFeePolicyFromEnv(env.WITHDRAWAL_FEE_SCHEDULE)).handle(request, actor);
        }
        if (pathname === '/v1/p2p/ads') {
          return await createP2PAdsRouter(new PostgresP2PAdRepository(pool)).handle(request, actor);
        }
        if (pathname === '/v1/p2p/orders') {
          return await createP2POrdersRouter(new PostgresP2POrderRepository(pool)).handle(request, actor);
        }
        if (pathname.startsWith('/v1/p2p/orders/')) {
          return await createP2POrderActionsRouter(new PostgresP2POrderRepository(pool)).handle(request, actor);
        }
        if (pathname === '/v1/me/p2p/payment-methods') {
          if (!env.OPENBAO_TRANSIT_URL || !env.OPENBAO_TRANSIT_TOKEN) throw new Error('OpenBao Transit configuration is unavailable');
          return await createP2PPaymentMethodsRouter(new PostgresP2PPaymentMethodRepository(
            pool,
            new OpenBaoP2PPaymentCryptographer({ token: env.OPENBAO_TRANSIT_TOKEN, url: env.OPENBAO_TRANSIT_URL }),
          )).handle(request, actor);
        }
        if (pathname === '/v1/me/wallet-addresses' || pathname === '/v1/wallet-addresses') {
          return await createWalletAddressRouter(repository, new PostgresWalletAddressRepository(
            pool,
            signerAddressDeriverFromEnv(env),
          )).handle(request, actor);
        }
        return await createReadOnlyWalletRouter(repository).handle(request, actor);
      } finally {
        await pool.end();
      }
    },
  };
}
