import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Figma 錢包引導提供登入、建立帳戶與安全的非帳密入口', () => {
  const flowPath = new URL('../src/OnboardingFlow.tsx', import.meta.url);
  assert.equal(existsSync(flowPath), true);
  const flow = source('src/OnboardingFlow.tsx');
  const shell = source('src/LoginShell.tsx');

  for (const text of ['登入', '建立帳戶', '略過', '開始使用']) assert.match(flow, new RegExp(text));
  assert.match(shell, /onSignIn/);
  assert.match(shell, /onSignUp/);
  assert.doesNotMatch(`${flow}\n${shell}`, /TextInput[\s\S]{0,120}(密碼|password)|(密碼|password)[\s\S]{0,120}TextInput/i);
});

test('Figma 錢包首頁僅提供 Ethereum 與 TRON 的真實充值流程', () => {
  const home = source('src/WalletHome.tsx');

  assert.match(home, /'ethereum-sepolia'/);
  assert.match(home, /'tron-shasta'/);
  assert.match(home, /allocateDepositAddress/);
  assert.match(home, /topup-confirmation/);
  assert.match(home, /submitInternalTransfer/);
  assert.match(home, /send-confirm/);
  assert.doesNotMatch(home, /\$12,765\.00|0x1234abcd|T[A-Z0-9]{33}/);
});
