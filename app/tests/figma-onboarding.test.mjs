import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('未登入首頁符合 Figma 引導版型且不顯示假餘額', () => {
  const source = read('src/LoginShell.tsx');

  for (const text of ['安全錢包', '登入後顯示可用資產', '略過', '開始使用', '轉帳', '收款']) {
    assert.match(source, new RegExp(text));
  }

  assert.doesNotMatch(source, /\$12,765\.00/);
  assert.match(source, /onPress=\{onSignIn\}/);
  assert.match(source, /disabled=\{busy\}/);
});
