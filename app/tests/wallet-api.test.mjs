import assert from 'node:assert/strict';
import test from 'node:test';

test('交易紀錄 API 會安全映射第一頁，且不保留回應中的敏感欄位', async () => {
  const { getWalletTransactions } = await import('../src/wallet-api.ts');
  assert.equal(typeof getWalletTransactions, 'function');
  const requests = [];

  const page = await getWalletTransactions({
    accessToken: 'signed-in-token',
    apiBaseUrl: 'https://ledger.example.test/',
    fetchImpl: async (url, init) => {
      requests.push({ init, url });
      return Response.json({
        next_cursor: null,
        transactions: [{
          amount_atoms: '1000000',
          asset_code: 'USDT',
          chain_tx_hash: 'must-not-reach-the-ui',
          counterparty_name: 'must-not-reach-the-ui',
          created_at: '2026-08-15T00:00:00.000Z',
          direction: 'outgoing',
          id: 'uuid',
          payout_destination: 'must-not-reach-the-ui',
          type: 'internal_transfer',
        }],
      });
    },
  });

  assert.equal(requests[0].url, 'https://ledger.example.test/v1/me/transactions?limit=20');
  assert.equal(requests[0].init.headers.Authorization, 'Bearer signed-in-token');
  assert.deepEqual(page, {
    nextCursor: undefined,
    transactions: [{
      id: 'uuid',
      type: 'internal_transfer',
      assetCode: 'USDT',
      amountAtoms: '1000000',
      direction: 'outgoing',
      createdAt: '2026-08-15T00:00:00.000Z',
    }],
  });
});

test('交易紀錄 API 只在載入下一頁時帶不透明游標', async () => {
  const { getWalletTransactions } = await import('../src/wallet-api.ts');
  assert.equal(typeof getWalletTransactions, 'function');
  const requests = [];

  await getWalletTransactions({
    accessToken: 'signed-in-token',
    apiBaseUrl: 'https://ledger.example.test',
    cursor: 'next:opaque cursor/kept-as-data',
    fetchImpl: async (url) => {
      requests.push(url);
      return Response.json({ next_cursor: 'later-opaque-cursor', transactions: [] });
    },
  });

  assert.equal(requests[0], 'https://ledger.example.test/v1/me/transactions?limit=20&cursor=next%3Aopaque+cursor%2Fkept-as-data');
});

test('交易紀錄 API 拒絕 HTTP 網址時不會呼叫 fetch', async () => {
  const { getWalletTransactions } = await import('../src/wallet-api.ts');
  assert.equal(typeof getWalletTransactions, 'function');
  let called = false;

  await assert.rejects(
    () => getWalletTransactions({
      accessToken: 'signed-in-token',
      apiBaseUrl: 'http://ledger.example.test',
      fetchImpl: async () => {
        called = true;
        return Response.json({});
      },
    }),
    /HTTPS/,
  );
  assert.equal(called, false);
});

test('交易紀錄 API 失敗時回傳交易紀錄專屬的重試提示', async () => {
  const { getWalletTransactions } = await import('../src/wallet-api.ts');

  await assert.rejects(
    () => getWalletTransactions({
      accessToken: 'signed-in-token',
      apiBaseUrl: 'https://ledger.example.test',
      fetchImpl: async () => Response.json({ error: 'unavailable' }, { status: 503 }),
    }),
    /未能讀取交易紀錄/,
  );
});

test('錢包餘額讀取會帶登入者的 Bearer token', async () => {
  const { getWalletSnapshot } = await import('../src/wallet-api.ts');
  const requests = [];

  const result = await getWalletSnapshot({
    accessToken: 'signed-in-token',
    apiBaseUrl: 'https://ledger.example.test/',
    fetchImpl: async (url, init) => {
      requests.push({ init, url });
      return Response.json({ account_id: 'wallet-1', balances: [{ asset_code: 'USDT', balance_atoms: '2500000' }] });
    },
  });

  assert.deepEqual(result, { accountId: 'wallet-1', balances: [{ assetCode: 'USDT', balanceAtoms: '2500000' }] });
  assert.equal(requests[0].url, 'https://ledger.example.test/v1/me/balances');
  assert.equal(requests[0].init.headers.Authorization, 'Bearer signed-in-token');
});

test('錢包 API 拒絕時不會把請求內容誤當成功', async () => {
  const { getWalletSnapshot } = await import('../src/wallet-api.ts');

  await assert.rejects(
    () => getWalletSnapshot({
      accessToken: 'signed-in-token',
      apiBaseUrl: 'https://ledger.example.test',
      fetchImpl: async () => Response.json({ error: 'unauthorized' }, { status: 401 }),
    }),
    /未能讀取錢包資料/,
  );
});

test('錢包 API 不會把登入者權杖送到不安全的 HTTP 網址', async () => {
  const { getWalletSnapshot } = await import('../src/wallet-api.ts');
  let called = false;

  await assert.rejects(
    () => getWalletSnapshot({
      accessToken: 'signed-in-token',
      apiBaseUrl: 'http://api.example.test',
      fetchImpl: async () => {
        called = true;
        return Response.json({});
      },
    }),
    /HTTPS/,
  );
  assert.equal(called, false);
});

test('站內轉帳使用冪等鍵且不把收款方放進網址', async () => {
  const { submitInternalTransfer } = await import('../src/wallet-api.ts');
  const requests = [];

  await submitInternalTransfer({
    accessToken: 'signed-in-token',
    amountAtoms: '1500000',
    apiBaseUrl: 'https://ledger.example.test',
    assetCode: 'USDT',
    fetchImpl: async (url, init) => {
      requests.push({ init, url });
      return Response.json({ status: 'committed', transfer_id: 'transfer-1' }, { status: 201 });
    },
    idempotencyKey: 'app-transfer-request-12345678',
    recipientWalletId: '7cc7c58e-3837-4381-bbdf-3248c97051fa',
  });

  assert.equal(requests[0].url, 'https://ledger.example.test/v1/me/internal-transfers');
  assert.equal(requests[0].init.headers['Idempotency-Key'], 'app-transfer-request-12345678');
  assert.equal(JSON.parse(requests[0].init.body).recipient_wallet_id, '7cc7c58e-3837-4381-bbdf-3248c97051fa');
});
