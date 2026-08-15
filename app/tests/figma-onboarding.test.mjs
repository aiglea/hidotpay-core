import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function assertStaticSpaConfig(configText) {
  const config = JSON.parse(configText);

  assert.deepEqual(Object.keys(config).sort(), [
    'assets',
    'compatibility_date',
    'name',
    'workers_dev',
  ]);
  assert.deepEqual(Object.keys(config.assets).sort(), ['directory', 'not_found_handling']);
  assert.equal(config.name, 'hidotpay-wallet-ui');
  assert.equal(config.compatibility_date, '2026-08-15');
  assert.equal(config.workers_dev, true);
  assert.equal(config.assets.directory, './dist');
  assert.equal(config.assets.not_found_handling, 'single-page-application');
}

test('未登入首頁符合 Figma 引導版型且不顯示假餘額', () => {
  const source = read('src/LoginShell.tsx');

  for (const text of ['安全錢包', '登入後顯示可用資產', '略過', '開始使用', '轉帳', '收款']) {
    assert.match(source, new RegExp(text));
  }

  assert.doesNotMatch(source, /\$12,765\.00/);
  assert.match(source, /onPress=\{onSignIn\}/);
  assert.match(source, /disabled=\{busy\}/);
  assert.match(source, /ScrollView/);
  assert.match(source, /<ScrollView[^>]+style=\{styles\.onboardingScroll\}/);
  assert.match(source, /onboardingScroll: \{[^}]*flex: 1/);
});

test('Cloudflare 錢包 UI 只部署 SPA 靜態資產', () => {
  const config = read('wrangler.wallet-ui.jsonc');
  assertStaticSpaConfig(config);
});

test('Cloudflare 錢包 UI 設定拒絕 Worker、API 與資料庫擴充', () => {
  const config = JSON.parse(read('wrangler.wallet-ui.jsonc'));

  for (const extra of [
    { main: 'src/index.ts' },
    { vars: { apiBaseUrl: 'https://api.example' } },
    { d1_databases: [{ binding: 'DB', database_name: 'wallet' }] },
  ]) {
    assert.throws(() => assertStaticSpaConfig(JSON.stringify({ ...config, ...extra })));
  }
});
