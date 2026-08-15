import assert from 'node:assert/strict';
import test from 'node:test';

import { DepositReconciliationWorker, InMemoryDepositReconciliationStore } from '../src/deposit-reconciliation.js';

const deposit = {
  amountAtoms: '1000001',
  assetCode: 'USDT',
  destinationAccountId: '2a770994-f0d7-4e5f-a7b8-51509d2e3f7a',
  id: '5e09b558-5fb5-4c9f-8e1f-f6b43a22da00',
  ledgerTransactionId: '1f865b2d-3ad6-4cb9-848e-4b5a59459a3f',
  precision: '1000000',
};

test('a queued Blnk entry is checked by reference until applied, without posting a duplicate', async () => {
  const store = new InMemoryDepositReconciliationStore([deposit]);
  let recorded = 0;
  let lookedUp = 0;
  const worker = new DepositReconciliationWorker(store, {
    async findTransactionByReference(reference) {
      lookedUp += 1;
      assert.equal(reference, 'hidotpay:ledger:1f865b2d-3ad6-4cb9-848e-4b5a59459a3f');
      return { blnkTransactionId: 'txn_blnk_123', status: 'APPLIED' };
    },
    async recordDepositCredit(input) {
      recorded += 1;
      assert.equal(input.amountAtoms, '1000001');
      return { blnkTransactionId: 'txn_blnk_123', status: 'QUEUED' };
    },
  });

  assert.deepEqual(await worker.reconcileBatch(10), { applied: 0, failed: 0, queued: 1 });
  assert.equal(recorded, 1);
  assert.equal(store.deposit(deposit.id)?.blnkReference, 'hidotpay:ledger:1f865b2d-3ad6-4cb9-848e-4b5a59459a3f');

  assert.deepEqual(await worker.reconcileBatch(10), { applied: 1, failed: 0, queued: 0 });
  assert.equal(recorded, 1);
  assert.equal(lookedUp, 1);
  assert.equal(store.deposit(deposit.id)?.reconciled, true);
});

test('a Blnk outage leaves the Cockroach entry pending and records only a bounded error', async () => {
  const store = new InMemoryDepositReconciliationStore([deposit]);
  const worker = new DepositReconciliationWorker(store, {
    async findTransactionByReference() {
      throw new Error('not reached');
    },
    async recordDepositCredit() {
      throw new Error('Blnk temporarily unavailable');
    },
  });

  assert.deepEqual(await worker.reconcileBatch(1), { applied: 0, failed: 1, queued: 0 });
  assert.equal(store.deposit(deposit.id)?.reconciled, false);
  assert.equal(store.deposit(deposit.id)?.lastError, 'Blnk temporarily unavailable');
});

test('a credited deposit reconciles exactly its immutable ledger transaction, never another pending deposit', async () => {
  const otherDeposit = { ...deposit, id: 'ec95b4db-91fd-4132-ae25-4a28a5a6f55a', ledgerTransactionId: '5e1f3b5c-1a21-43b2-91a0-8a0cb6c16a30' };
  const store = new InMemoryDepositReconciliationStore([deposit, otherDeposit]);
  const recorded: string[] = [];
  const worker = new DepositReconciliationWorker(store, {
    async findTransactionByReference() { throw new Error('not reached'); },
    async recordDepositCredit(input) {
      recorded.push(input.ledgerTransactionId);
      return { blnkTransactionId: 'txn_blnk_123', status: 'APPLIED' };
    },
  });

  assert.deepEqual(await worker.reconcileLedgerTransaction(deposit.ledgerTransactionId), {
    ledgerTransactionId: deposit.ledgerTransactionId,
    status: 'applied',
  });
  assert.deepEqual(recorded, [deposit.ledgerTransactionId]);
  assert.equal(store.deposit(deposit.id)?.reconciled, true);
  assert.equal(store.deposit(otherDeposit.id)?.reconciled, false);
});
