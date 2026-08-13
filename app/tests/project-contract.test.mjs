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

test('README gives Traditional Chinese web and Android instructions without secrets', () => {
  const readme = read('README.md');
  assert.match(readme, /npm install/);
  assert.match(readme, /npm run web/);
  assert.match(readme, /tlc4kgyfsukbz60exkmun/);
  assert.match(readme, /jmefg2ses94nuvrkrc07i/);
  assert.doesNotMatch(readme, /client secret/i);
});
