import assert from 'node:assert/strict';
import test from 'node:test';

import { readModelServiceUser } from './read-model-service-user.mjs';

test('read model service user is distinct from human administrators and has only the writer role', () => {
  assert.deepEqual(readModelServiceUser, {
    email: 'service-read-model-writer@hidotpay.invalid',
    nickname: 'HiDot Pay Read Model Writer',
    roles: ['hidotpay_admin_read_model_writer'],
    username: 'hidotpay_read_model_writer',
  });
});
