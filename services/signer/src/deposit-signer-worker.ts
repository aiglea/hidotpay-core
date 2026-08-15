import { DepositAddressService } from './deposit-address-service.js';
import { DomainError } from './domain-errors.js';
import { PrivateSignerHttpHandler } from './private-signer-http.js';
import { SignerPolicy, type SigningBackend } from './signer-policy.js';
import { XpubDepositBackend } from './xpub-deposit-backend.js';

export type DepositSignerEnv = {
  ETH_ACCOUNT_XPUB: string;
  SIGNER_SERVICE_TOKEN: string;
  TRON_ACCOUNT_XPUB: string;
};

class WithdrawalsDisabledBackend implements SigningBackend {
  public async sign(): Promise<string> {
    throw new DomainError('signer_withdrawals_disabled');
  }
}

export function createDepositSignerWorker(env: DepositSignerEnv) {
  const handler = new PrivateSignerHttpHandler({
    addressService: new DepositAddressService({
      allowedNetworks: ['ethereum', 'ethereum-sepolia', 'tron', 'tron-shasta'],
      mainnetEnabled: false,
      trustedCaller: 'wallet-address-service',
    }, new XpubDepositBackend({ ethereum: env.ETH_ACCOUNT_XPUB, tron: env.TRON_ACCOUNT_XPUB })),
    serviceToken: env.SIGNER_SERVICE_TOKEN,
    signingPolicy: new SignerPolicy({
      allowedNetworks: ['ethereum', 'ethereum-sepolia', 'tron', 'tron-shasta'],
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
