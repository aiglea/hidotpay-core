import assert from 'node:assert/strict';
import test from 'node:test';

import { bootstrapReadModel, readModelCollections } from './read-model-schema.mjs';

test('read model schema gives every financial projection a unique source id and excludes custody fields', () => {
  assert.equal(readModelCollections.length, 6);
  for (const collection of readModelCollections) {
    assert.match(collection.name, /^hidotpay_admin_/);
    if (collection.name !== 'hidotpay_admin_projection_status') {
      assert.equal(collection.fields.some((field) => field.name === 'source_id' && field.unique === true), true);
    }
    assert.equal(collection.fields.some((field) => /private|seed|mnemonic|signer|encrypted_payload/i.test(field.name)), false);
  }
});

test('bootstrap creates only missing collections and fields through the NocoBase metadata API', async () => {
  const createdCollections = [];
  const createdFields = [];
  await bootstrapReadModel({
    async createCollection(collection) { createdCollections.push(collection); },
    async createField(field) { createdFields.push(field); },
    async listCollections() { return ['hidotpay_admin_projection_status']; },
    async listFields() { return ['hidotpay_admin_projection_status:name']; },
  });

  assert.equal(createdCollections.some((collection) => collection.name === 'hidotpay_admin_projection_status'), false);
  assert.equal(createdCollections.length, 5);
  assert.equal(createdFields.some((field) => field.collectionName === 'hidotpay_admin_projection_status' && field.name === 'name'), false);
  assert.equal(createdFields.some((field) => field.collectionName === 'hidotpay_admin_projection_status' && field.name === 'projected_at'), true);
});
