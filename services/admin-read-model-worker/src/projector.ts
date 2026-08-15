import { projectionNames, type ProjectionName, type ProjectionRecord } from './contracts.js';
import { normalizeProjectionRows } from './normalize.js';

export interface AdminProjectionSource {
  list(name: ProjectionName): Promise<Record<string, unknown>[]>;
}

export interface AdminProjectionTarget {
  markSuccess(at: string): Promise<void>;
  upsert(name: ProjectionName, records: ProjectionRecord[]): Promise<void>;
}

export class AdminReadModelProjector {
  constructor(
    private readonly source: AdminProjectionSource,
    private readonly target: AdminProjectionTarget,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async runOnce(): Promise<{ projected: number; projections: Record<ProjectionName, number> }> {
    const projections = {} as Record<ProjectionName, number>;
    let projected = 0;

    for (const name of projectionNames) {
      const records = normalizeProjectionRows(name, await this.source.list(name));
      await this.target.upsert(name, records);
      projections[name] = records.length;
      projected += records.length;
    }

    await this.target.markSuccess(this.now());
    return { projected, projections };
  }
}
