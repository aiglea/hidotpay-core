import assert from 'node:assert/strict';
import test from 'node:test';

import { bootstrapApiKeyResources, financeViewerRole, readModelWriterRole } from './read-model-role.mjs';

test('read model writer role permits updateOrCreate only for the six projection collections', () => {
  assert.equal(readModelWriterRole.name, 'hidotpay_admin_read_model_writer');
  assert.equal(readModelWriterRole.allowConfigure, false);
  assert.equal(readModelWriterRole.allowNewMenu, false);
  assert.deepEqual(readModelWriterRole.strategy, { actions: [] });
  assert.equal(readModelWriterRole.resources.length, 6);

  for (const resource of readModelWriterRole.resources) {
    assert.match(resource.name, /^hidotpay_admin_/);
    assert.equal(resource.usingActionsConfig, true);
    assert.deepEqual(resource.actions.map((action) => action.name), ['updateOrCreate']);
    assert.equal(resource.actions[0].fields.includes('private_key'), false);
    assert.equal(resource.actions[0].fields.includes('encrypted_payload'), false);
  }
});

test('API-key bootstrap permission is an explicit temporary resource rather than a broad strategy', () => {
  const resources = bootstrapApiKeyResources();
  const apiKeys = resources.filter((resource) => resource.name === 'apiKeys');
  assert.deepEqual(apiKeys, [{
    actions: [{ fields: [], name: 'create' }],
    dataSourceKey: 'main',
    name: 'apiKeys',
    usingActionsConfig: true,
  }]);
  assert.equal(resources.filter((resource) => resource.name.startsWith('hidotpay_admin_')).length, 6);
});

test('finance viewer can only list and get the six read-model collections', () => {
  assert.equal(financeViewerRole.name, 'hidotpay_finance_viewer');
  assert.equal(financeViewerRole.resources.length, 6);
  assert.equal(financeViewerRole.allowConfigure, false);
  for (const resource of financeViewerRole.resources) {
    assert.match(resource.name, /^hidotpay_admin_/);
    assert.deepEqual(resource.actions.map((action) => action.name), ['list', 'get']);
  }
});
