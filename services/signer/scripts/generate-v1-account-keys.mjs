#!/usr/bin/env node
/**
 * Generates public account material into macOS keychain.
 * Never prints seeds, xprv, or private keys.
 */
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { hmac } from '@noble/hashes/hmac.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { HDKey } from '@scure/bip32';
import { base32, base58 } from '@scure/base';

const ACCOUNT = 'hidotpay-development';
const TABLE_SIZE = 512;

function keychainHas(service) {
  try {
    execFileSync('security', ['find-generic-password', '-s', service], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function keychainPut(service, value) {
  execFileSync('security', ['add-generic-password', '-U', '-a', ACCOUNT, '-s', service, '-w', value], { stdio: 'pipe' });
}

function storeXpub(service, path) {
  if (keychainHas(service)) {
    process.stdout.write(`${service}: already present\n`);
    return;
  }
  const seed = randomBytes(64);
  const account = HDKey.fromMasterSeed(seed).derive(path);
  if (!account.publicExtendedKey) throw new Error('failed to derive public account key');
  keychainPut(`${service}-seed`, seed.toString('hex'));
  keychainPut(service, account.publicExtendedKey);
  process.stdout.write(`${service}: stored public xpub\n`);
}

function slip10Master(seed) {
  const I = hmac(sha512, new TextEncoder().encode('ed25519 seed'), seed);
  return { key: I.subarray(0, 32), chain: I.subarray(32) };
}

function slip10Harden(node, index) {
  const data = new Uint8Array(1 + 32 + 4);
  data.set(node.key, 1);
  data[33] = (index >> 24) & 0xff;
  data[34] = (index >> 16) & 0xff;
  data[35] = (index >> 8) & 0xff;
  data[36] = index & 0xff;
  const I = hmac(sha512, node.chain, data);
  return { key: I.subarray(0, 32), chain: I.subarray(32) };
}

function derivePath(seed, indexes) {
  let node = slip10Master(seed);
  for (const index of indexes) node = slip10Harden(node, index + 0x80000000);
  return node;
}

function crc16xmodem(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

function stellarAddress(publicKey) {
  const payload = new Uint8Array(35);
  payload[0] = 6 << 3;
  payload.set(publicKey, 1);
  const crc = crc16xmodem(payload.subarray(0, 33));
  payload[33] = crc & 0xff;
  payload[34] = crc >> 8;
  return base32.encode(payload).replace(/=+$/, '');
}

function storeEd25519Table(service, coinType, encode) {
  const tableService = service.replace(/-account-seed$/, '-address-table');
  if (keychainHas(tableService) && keychainHas(service)) {
    process.stdout.write(`${tableService}: already present\n`);
    return;
  }
  const seed = keychainHas(service)
    ? Buffer.from(execFileSync('security', ['find-generic-password', '-s', service, '-w'], { encoding: 'utf8' }).trim(), 'hex')
    : randomBytes(32);
  if (!keychainHas(service)) keychainPut(service, seed.toString('hex'));
  const addresses = [];
  for (let index = 0; index < TABLE_SIZE; index += 1) {
    const node = derivePath(seed, [44, coinType, 0, 0, index]);
    addresses.push(encode(ed25519.getPublicKey(node.key)));
  }
  keychainPut(tableService, JSON.stringify(addresses));
  process.stdout.write(`${tableService}: stored ${addresses.length} public addresses\n`);
}

storeXpub('hidotpay-btc-account-xpub', "m/84'/0'/0'");
storeXpub('hidotpay-xrp-account-xpub', "m/44'/144'/0'");
storeEd25519Table('hidotpay-sol-account-seed', 501, (publicKey) => base58.encode(publicKey));
storeEd25519Table('hidotpay-xlm-account-seed', 148, stellarAddress);

if (keychainHas('hidotpay-ton-address-table') && keychainHas('hidotpay-ton-account-seed')) {
  process.stdout.write('hidotpay-ton-address-table: already present\n');
} else {
  const { keyPairFromSeed } = await import('@ton/crypto');
  const { WalletContractV4 } = await import('@ton/ton');
  const service = 'hidotpay-ton-account-seed';
  const seed = keychainHas(service)
    ? Buffer.from(execFileSync('security', ['find-generic-password', '-s', service, '-w'], { encoding: 'utf8' }).trim(), 'hex')
    : randomBytes(32);
  if (!keychainHas(service)) keychainPut(service, seed.toString('hex'));
  const addresses = [];
  for (let index = 0; index < TABLE_SIZE; index += 1) {
    const node = derivePath(seed, [44, 607, 0, 0, index]);
    const keyPair = keyPairFromSeed(Buffer.from(node.key));
    const wallet = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
    addresses.push(wallet.address.toString({ bounceable: true, testOnly: true, urlSafe: true }));
  }
  keychainPut('hidotpay-ton-address-table', JSON.stringify(addresses));
  process.stdout.write(`hidotpay-ton-address-table: stored ${addresses.length} public addresses\n`);
}
