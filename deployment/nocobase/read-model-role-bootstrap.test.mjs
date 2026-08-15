import assert from 'node:assert/strict';
import test from 'node:test';

import { configureReadModelRole, configureReadModelWriter } from './read-model-role-bootstrap.mjs';
import { financeViewerRole } from './read-model-role.mjs';

test('role bootstrap creates the restricted role and configures only its main data-source resources', async () => {
  const calls = [];
  await configureReadModelWriter({
    async createRole(role) { calls.push(['createRole', role]); },
    async listRoles() { return []; },
    async updateMainDataSourceRole(roleName, values) { calls.push(['updateMainDataSourceRole', roleName, values]); },
    async updateRole(roleName, role) { calls.push(['updateRole', roleName, role]); },
  });

  assert.equal(calls[0][0], 'createRole');
  assert.equal(calls[1][0], 'updateMainDataSourceRole');
  assert.equal(calls[1][1], 'hidotpay_admin_read_model_writer');
  assert.equal(calls[1][2].resources.length, 6);
  assert.equal(calls.some((call) => call[0] === 'updateRole'), false);
});

test('role bootstrap updates rather than duplicates an existing restricted role', async () => {
  const calls = [];
  await configureReadModelWriter({
    async createRole(role) { calls.push(['createRole', role]); },
    async listRoles() { return ['hidotpay_admin_read_model_writer']; },
    async updateMainDataSourceRole(roleName, values) { calls.push(['updateMainDataSourceRole', roleName, values]); },
    async updateRole(roleName, role) { calls.push(['updateRole', roleName, role]); },
  });

  assert.equal(calls[0][0], 'updateRole');
  assert.equal(calls[1][0], 'updateMainDataSourceRole');
  assert.equal(calls.some((call) => call[0] === 'createRole'), false);
});

test('generic role bootstrap configures the finance viewer without granting writer actions', async () => {
  const calls = [];
  await configureReadModelRole({
    async createRole(role) { calls.push(['createRole', role]); },
    async listRoles() { return []; },
    async updateMainDataSourceRole(roleName, values) { calls.push(['updateMainDataSourceRole', roleName, values]); },
    async updateRole(roleName, role) { calls.push(['updateRole', roleName, role]); },
  }, financeViewerRole);

  assert.equal(calls[0][1].name, 'hidotpay_finance_viewer');
  assert.deepEqual(calls[1][2].resources[0].actions.map((action) => action.name), ['list', 'get']);
});
