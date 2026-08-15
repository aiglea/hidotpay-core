import { configureReadModelRole } from './read-model-role-bootstrap.mjs';
import { financeViewerRole, readModelWriterRole } from './read-model-role.mjs';

const baseUrl = process.env.NOCOBASE_URL?.replace(/\/$/, '');
const token = process.env.NOCOBASE_BOOTSTRAP_TOKEN;
if (!baseUrl) throw new Error('NOCOBASE_URL is required');
if (!token) throw new Error('NOCOBASE_BOOTSTRAP_TOKEN is required');

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`NocoBase ACL bootstrap request failed with HTTP ${response.status}`);
  return response.json();
}

const client = {
  async createRole(role) { await request('/api/roles:create', { body: JSON.stringify(role), method: 'POST' }); },
  async listRoles() { return (await request('/api/roles?paginate=false')).data.map((role) => role.name); },
  async updateMainDataSourceRole(roleName, values) {
    await request(`/api/dataSources/main/roles:update?filterByTk=${encodeURIComponent(roleName)}`, { body: JSON.stringify(values), method: 'POST' });
  },
  async updateRole(roleName, role) {
    await request(`/api/roles:update?filterByTk=${encodeURIComponent(roleName)}`, { body: JSON.stringify(role), method: 'POST' });
  },
};

await configureReadModelRole(client, readModelWriterRole);
await configureReadModelRole(client, financeViewerRole);
process.stdout.write('NocoBase read-model ACL roles are ready\n');
