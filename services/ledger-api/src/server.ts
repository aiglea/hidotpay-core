import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { buildApp } from './http/app.js';
import { PostgresLedgerRepository } from './repositories/postgres-ledger-repository.js';
import { fixedWithdrawalFeePolicy } from './services/funding-service.js';

const config = loadConfig(process.env);
if (!config.databaseUrl) throw new Error('DATABASE_URL is required to start ledger API');

const pool = createPool(config.databaseUrl);
const app = buildApp({
  environment: config.environment,
  developmentApiKey: config.developmentApiKey,
  logtoAudience: config.logtoAudience,
  logtoIssuer: config.logtoIssuer,
  repository: new PostgresLedgerRepository(pool),
  withdrawalFeePolicy: fixedWithdrawalFeePolicy(config.withdrawalFeeSchedule),
});

const close = async () => {
  await app.close();
  await pool.end();
};
process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());

await app.listen({ host: config.host, port: config.port });
