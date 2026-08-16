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

test('Figma 錢包首頁提供第一版 15 條鏈的真實充值流程', () => {
  const home = source('src/WalletHome.tsx');
  const networks = source('src/product-networks.ts');

  for (const network of [
    'ethereum-sepolia', 'bnb-testnet', 'polygon-amoy', 'arbitrum-sepolia', 'optimism-sepolia',
    'base-sepolia', 'avalanche-fuji', 'linea-sepolia', 'scroll-sepolia', 'tron-shasta',
    'bitcoin-testnet4', 'solana-devnet', 'ton-testnet', 'xrpl-testnet', 'stellar-testnet',
  ]) assert.match(networks, new RegExp(`id: '${network}'`));
  assert.match(home, /WALLET_NETWORKS/);
  assert.match(home, /allocateDepositAddress/);
  assert.match(home, /topup-confirmation/);
  assert.match(home, /submitInternalTransfer/);
  assert.match(home, /send-confirm/);
  assert.doesNotMatch(home, /\$12,765\.00|0x1234abcd|T[A-Z0-9]{33}/);
});
