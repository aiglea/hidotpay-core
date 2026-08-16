#!/usr/bin/env node
/**
 * Uploads public address tables as Cloudflare Worker secret chunks.
 * A single text binding is limited to 5.1 kB; never prints addresses or seeds.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 4800;
const CONFIG = fileURLToPath(new URL('../wrangler.deposit-signer-staging.jsonc', import.meta.url));

const TABLES = [
  { env: 'SOL_ADDRESS_TABLE', keychain: 'hidotpay-sol-address-table' },
  { env: 'TON_ADDRESS_TABLE', keychain: 'hidotpay-ton-address-table' },
  { env: 'XLM_ADDRESS_TABLE', keychain: 'hidotpay-xlm-address-table' },
];

function chunkAddresses(addresses) {
  const chunks = [];
  let current = [];
  for (const address of addresses) {
    const next = [...current, address];
    if (JSON.stringify(next).length > MAX_BYTES) {
      if (current.length === 0) throw new Error('single address exceeds Cloudflare text binding limit');
      chunks.push(current);
      current = [address];
    } else {
      current = next;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks.map((chunk) => JSON.stringify(chunk));
}

function putSecret(name, value) {
  const result = spawnSync('npx', ['wrangler@4', 'secret', 'put', name, '--config', CONFIG], {
    input: value,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${name} upload failed`);
  }
}

for (const table of TABLES) {
  const raw = execFileSync('security', ['find-generic-password', '-s', table.keychain, '-w'], {
    encoding: 'utf8',
  }).trim();
  const addresses = JSON.parse(raw);
  if (!Array.isArray(addresses) || addresses.length < 1) throw new Error(`${table.keychain} is empty`);
  const chunks = chunkAddresses(addresses);
  process.stdout.write(`${table.env}: ${addresses.length} public addresses in ${chunks.length} chunks\n`);
  chunks.forEach((chunk, index) => {
    putSecret(`${table.env}_${index}`, chunk);
  });
}
