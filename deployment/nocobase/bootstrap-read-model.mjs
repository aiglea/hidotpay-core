import { bootstrapReadModel } from './read-model-schema.mjs';

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
  if (!response.ok) throw new Error(`NocoBase bootstrap request failed with HTTP ${response.status}`);
  return response.json();
}

await bootstrapReadModel({
  async createCollection(collection) {
    await request('/api/collections:create', { body: JSON.stringify(collection), method: 'POST' });
  },
  async createField(field) {
    await request('/api/fields:create', { body: JSON.stringify(field), method: 'POST' });
  },
  async listCollections() {
    const payload = await request('/api/collections?paginate=false');
    return (payload.data ?? []).map((collection) => collection.name);
  },
  async listFields() {
    const payload = await request('/api/fields?paginate=false');
    return (payload.data ?? []).map((field) => `${field.collectionName}:${field.name}`);
  },
});

process.stdout.write('NocoBase read model collections are ready\n');
