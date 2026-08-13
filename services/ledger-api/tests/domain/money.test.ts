import assert from 'node:assert/strict';
import test from 'node:test';

import { parsePositiveAtoms } from '../../src/domain/money.js';

test('parses an atom amount without losing precision', () => {
  assert.equal(parsePositiveAtoms('900719925474099312345').toString(), '900719925474099312345');
});

test('rejects decimal, zero, negative, exponent, and whitespace money inputs', () => {
  for (const value of ['1.2', '0', '-1', '1e3', ' 1', '01']) {
    assert.throws(() => parsePositiveAtoms(value), /invalid_amount/);
  }
});
