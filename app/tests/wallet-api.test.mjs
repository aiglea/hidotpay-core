import assert from 'node:assert/strict';
import test from 'node:test';

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
