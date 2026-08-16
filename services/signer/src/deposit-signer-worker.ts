import { SIGNER_ALLOWED_NETWORKS } from './product-networks.js';
import { DepositAddressService } from './deposit-address-service.js';
import { DomainError } from './domain-errors.js';
import { PrivateSignerHttpHandler } from './private-signer-http.js';
import { loadPublicAddressTable, PublicAddressTableBackend } from './public-address-table.js';
import { RoutingDepositBackend } from './routing-deposit-backend.js';
import { SignerPolicy, type SigningBackend } from './signer-policy.js';
import { XpubDepositBackend } from './xpub-deposit-backend.js';

export type DepositSignerEnv = {
  BTC_ACCOUNT_XPUB: string;
  ETH_ACCOUNT_XPUB: string;
  SIGNER_SERVICE_TOKEN: string;
  TRON_ACCOUNT_XPUB: string;
  XRP_ACCOUNT_XPUB: string;
  [name: string]: string | undefined;
};

class WithdrawalsDisabledBackend implements SigningBackend {
  public async sign(): Promise<string> {
    throw new DomainError('signer_withdrawals_disabled');
  }
}

export function createDepositSignerWorker(env: DepositSignerEnv) {
  const allowedNetworks = [...SIGNER_ALLOWED_NETWORKS];
  const handler = new PrivateSignerHttpHandler({
    addressService: new DepositAddressService({
      allowedNetworks,
      mainnetEnabled: false,
      trustedCaller: 'wallet-address-service',
    }, new RoutingDepositBackend(
      new XpubDepositBackend({
        bitcoin: env.BTC_ACCOUNT_XPUB,
        ethereum: env.ETH_ACCOUNT_XPUB,
        tron: env.TRON_ACCOUNT_XPUB,
        xrp: env.XRP_ACCOUNT_XPUB,
      }),
      new PublicAddressTableBackend({
        solana: loadPublicAddressTable(env, 'SOL_ADDRESS_TABLE'),
        stellar: loadPublicAddressTable(env, 'XLM_ADDRESS_TABLE'),
        ton: loadPublicAddressTable(env, 'TON_ADDRESS_TABLE'),
      }),
    )),
    serviceToken: env.SIGNER_SERVICE_TOKEN,
    signingPolicy: new SignerPolicy({
      allowedNetworks,
      mainnetEnabled: false,
      maxWithdrawalAtoms: '1',
      trustedCaller: 'withdrawal-worker',
    }, new WithdrawalsDisabledBackend()),
  });

  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const result = await handler.handle({
        authorization: request.headers.get('authorization') ?? undefined,
        body: await request.text(),
        method: request.method,
        path: url.pathname,
      });
      return new Response(result.body, { headers: result.headers, status: result.statusCode });
    },
  };
}
