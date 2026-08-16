import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { boundRuntimeFetch, rpcTimeoutSignal } from '../src/rpc-timeout.js';

test('rpc timeout uses AbortSignal.timeout when the runtime provides it', () => {
  const expected = new AbortController().signal;
  const signal = rpcTimeoutSignal(10_000, { timeout: () => expected });
  assert.equal(signal, expected);
});

test('rpc timeout falls back when AbortSignal.timeout is missing, as on some Workers runtimes', () => {
  const signal = rpcTimeoutSignal(20, {});
  assert.equal(signal.aborted, false);
});

test('runtime fetch is bound to globalThis so Workers do not throw Illegal invocation', () => {
  const source = readFileSync(new URL('../src/rpc-timeout.ts', import.meta.url), 'utf8');
  assert.match(source, /globalThis\.fetch/);
  assert.equal(typeof boundRuntimeFetch, 'function');
});
