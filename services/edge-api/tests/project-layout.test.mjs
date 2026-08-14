import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('financial edge worker project', () => {
  it('declares a Hyperdrive binding without committing its connection value', async () => {
    const config = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
    assert.match(config, /"binding": "HYPERDRIVE"/);
    assert.doesNotMatch(config, /postgres(?:ql)?:\/\//i);
  });
});
