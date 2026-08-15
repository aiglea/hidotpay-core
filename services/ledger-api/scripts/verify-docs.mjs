import { existsSync, readFileSync } from 'node:fs';

const required = [
  'docs/README.md',
  'docs/quick-start.md',
  'docs/api.md',
  'docs/security.md',
  'docs/operations.md',
  'docs/public-development-deployment.md',
  'openapi/openapi.yaml',
];

for (const file of required) {
  if (!existsSync(file)) throw new Error(`missing documentation: ${file}`);
}

const openapi = readFileSync('openapi/openapi.yaml', 'utf8');
for (const endpoint of ['/internal-transfers:', '/wallet-addresses:', '/deposits/confirmed:', '/withdrawal-fee-quotes:', '/withdrawals:', '/withdrawals/{withdrawalId}/approve:']) {
  if (!openapi.includes(endpoint)) throw new Error(`OpenAPI endpoint missing: ${endpoint}`);
}
console.log('documentation verified');
