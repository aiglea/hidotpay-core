import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { buildApp } from './http/app.js';
import { RemoteSignerAddressDeriver } from './integrations/signer-address-deriver.js';
import { OpenBaoP2PPaymentCryptographer } from './integrations/openbao-p2p-payment-cryptographer.js';
import { PostgresLedgerRepository } from './repositories/postgres-ledger-repository.js';
import { PostgresP2PAdRepository } from './repositories/postgres-p2p-ad-repository.js';
import { PostgresP2POrderRepository } from './repositories/postgres-p2p-order-repository.js';
import { PostgresP2PPaymentMethodRepository } from './repositories/postgres-p2p-payment-method-repository.js';
import { PostgresWalletAddressRepository } from './repositories/postgres-wallet-address-repository.js';
import { fixedWithdrawalFeePolicy } from './services/funding-service.js';

const config = loadConfig(process.env);
if (!config.databaseUrl) throw new Error('DATABASE_URL is required to start ledger API');
if (!config.signerDerivationUrl || !config.signerServiceToken) throw new Error('private signer configuration is required to start ledger API');
const openBaoTransitUrl = process.env.OPENBAO_TRANSIT_URL;
const openBaoTransitToken = process.env.OPENBAO_TRANSIT_TOKEN;
if (!openBaoTransitUrl || !openBaoTransitToken) throw new Error('OpenBao Transit configuration is required to start ledger API');

const pool = createPool(config.databaseUrl);
const walletAddresses = new PostgresWalletAddressRepository(pool, new RemoteSignerAddressDeriver({
  serviceToken: config.signerServiceToken,
  url: config.signerDerivationUrl,
}));
const app = buildApp({
  environment: config.environment,
  developmentApiKey: config.developmentApiKey,
  logtoAudience: config.logtoAudience,
  logtoIssuer: config.logtoIssuer,
  repository: new PostgresLedgerRepository(pool),
  p2pAds: new PostgresP2PAdRepository(pool),
  p2pOrders: new PostgresP2POrderRepository(pool, { paymentTimeoutMs: config.p2pPaymentTimeoutMs }),
  p2pPaymentMethods: new PostgresP2PPaymentMethodRepository(pool, new OpenBaoP2PPaymentCryptographer({ token: openBaoTransitToken, url: openBaoTransitUrl })),
  walletAddresses,
  withdrawalFeePolicy: fixedWithdrawalFeePolicy(config.withdrawalFeeSchedule),
  withdrawalRiskControls: config.withdrawalRiskControls,
  withdrawalsEnabled: config.withdrawalsEnabled,
});

const close = async () => {
  await app.close();
  await pool.end();
};
process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());

await app.listen({ host: config.host, port: config.port });
