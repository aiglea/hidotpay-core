import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('web configuration uses the supplied public Logto SPA app and callback', () => {
  assert.match(read('app.config.js'), /tlc4kgyfsukbz60exkmun/);
  assert.match(read('app.config.js'), /https:\/\/ngu7sy\.logto\.app/);
  assert.match(read('package.json'), /expo start --web --port 3000/);
});

test('routes use Logto hosted authentication and keep web and Android clients separate', () => {
  assert.match(read('app/_layout.tsx'), /RootLayout/);
  assert.match(read('app/index.tsx'), /export default/);
  assert.match(read('app/callback.tsx'), /export default/);
  assert.match(read('app/index.web.tsx'), /signIn\(webRedirectUri\)/);
  assert.match(read('app/index.native.tsx'), /signIn\('hidotpay:\/\/callback'\)/);
  assert.match(read('app/_layout.web.tsx'), /logtoWebAppId/);
  assert.match(read('app/_layout.native.tsx'), /logtoNativeAppId/);
  assert.doesNotMatch(read('app/index.web.tsx'), /password/i);
  assert.doesNotMatch(read('app/index.native.tsx'), /password/i);
});

test('web callback returns to the application home after Logto completes', () => {
  assert.match(read('app/callback.web.tsx'), /router\.replace\('\/'\)/);
});

test('web logout uses a dedicated post-sign-out redirect URI', () => {
  assert.match(read('src/auth-config.ts'), /webPostLogoutRedirectUri = 'http:\/\/localhost:3000'/);
  assert.match(read('app/index.web.tsx'), /signOut\(webPostLogoutRedirectUri\)/);
});

test('已登入使用者會進入錢包首頁，而非停留在登入測試殼', () => {
  assert.match(read('app/index.web.tsx'), /<WalletHome/);
  assert.match(read('app/index.native.tsx'), /<WalletHome/);
  assert.match(read('src/WalletHome.tsx'), /充值地址/);
  assert.match(read('src/WalletHome.tsx'), /站內轉帳/);
});

test('錢包服務網址是公開設定，不能是 App 內嵌密鑰', () => {
  assert.match(read('app.config.js'), /EXPO_PUBLIC_LEDGER_API_BASE_URL/);
  assert.match(read('.env.example'), /EXPO_PUBLIC_LEDGER_API_BASE_URL/);
});

test('錢包首頁在桌面與窄螢幕可捲動，不會截斷轉帳表單', () => {
  const walletHome = read('src/WalletHome.tsx');
  assert.match(walletHome, /<ScrollView[^>]+style=\{styles\.scrollView\}/);
  assert.match(walletHome, /scrollView: \{ flex: 1 \}/);
  assert.match(walletHome, /page: \{[^}]*overflow: 'hidden'/);
});

test('轉帳遇到網路錯誤會保留同一個冪等鍵，避免重按造成重複扣款', () => {
  const walletHome = read('src/WalletHome.tsx');
  assert.match(walletHome, /const transferIdempotencyKey = useRef<string \| undefined>\(undefined\)/);
  assert.match(walletHome, /transferIdempotencyKey\.current = idempotencyKey/);
  assert.match(walletHome, /idempotencyKey,/);
});

test('交易紀錄只顯示安全欄位，並涵蓋載入、空白、失敗重試與下一頁狀態', () => {
  const walletHome = read('src/WalletHome.tsx');
  assert.match(walletHome, /getWalletTransactions/);
  assert.match(walletHome, /交易紀錄載入中/);
  assert.match(walletHome, /尚無交易紀錄/);
  assert.match(walletHome, /重新載入/);
  assert.match(walletHome, /載入更多/);
  assert.match(walletHome, /nextCursor/);
  assert.match(walletHome, /其他交易/);
  assert.doesNotMatch(walletHome, /counterparty|payout|chain[_-]?(tx|hash|address)/i);
});

test('release version is incremented and consistent across app metadata', () => {
  const packageVersion = JSON.parse(read('package.json')).version;
  const packageLockVersion = JSON.parse(read('package-lock.json')).version;

  assert.match(packageVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(packageLockVersion, packageVersion);
  assert.match(read('app.config.js'), new RegExp(`version: '${packageVersion.replaceAll('.', '\\.')}'`));
  assert.match(read('../CHANGELOG.md'), new RegExp(`## ${packageVersion.replaceAll('.', '\\.')}`));
});

test('README gives Traditional Chinese web and Android instructions without secrets', () => {
  const readme = read('README.md');
  assert.match(readme, /npm install/);
  assert.match(readme, /npm run web/);
  assert.match(readme, /tlc4kgyfsukbz60exkmun/);
  assert.match(readme, /jmefg2ses94nuvrkrc07i/);
  assert.doesNotMatch(readme, /client secret/i);
});
