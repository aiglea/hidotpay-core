import type { ProjectionName, ProjectionRecord } from './contracts.js';
import type { AdminProjectionTarget } from './projector.js';

type FetchFunction = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type NocoBaseProjectionTargetOptions = {
  baseUrl: string;
  fetch?: FetchFunction;
  token: string;
};

export class NocoBaseProjectionTarget implements AdminProjectionTarget {
  private readonly baseUrl: string;
  private readonly fetch: FetchFunction;
  private readonly token: string;

  constructor(options: NocoBaseProjectionTargetOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetch = options.fetch ?? globalThis.fetch;
    this.token = options.token;
  }

  async markSuccess(at: string): Promise<void> {
    await this.post('hidotpay_admin_projection_status', ['name'], { name: 'financial', projected_at: at });
  }

  async upsert(name: ProjectionName, records: ProjectionRecord[]): Promise<void> {
    for (const record of records) {
      await this.post(`hidotpay_admin_${name}`, ['source_id'], record);
    }
  }

  private async post(collection: string, filterKeys: string[], values: object): Promise<void> {
    const params = new URLSearchParams();
    for (const filterKey of filterKeys) params.append('filterKeys[]', filterKey);
    const response = await this.fetch(`${this.baseUrl}/api/${collection}:updateOrCreate?${params}`, {
      body: JSON.stringify(values),
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
      },
      method: 'POST',
    });
    if (!response.ok) throw new Error(`NocoBase projection request failed with HTTP ${response.status}`);
  }
}
