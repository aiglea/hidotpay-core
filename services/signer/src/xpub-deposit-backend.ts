import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { HDKey } from '@scure/bip32';
import { base58check } from '@scure/base';

import { DomainError } from './domain-errors.js';
import type { DepositAddressBackend } from './deposit-address-service.js';

const b58check = base58check(sha256);

export type AccountXpubs = {
  ethereum: string;
  tron: string;
};

export class XpubDepositBackend implements DepositAddressBackend {
  private readonly ethereum: HDKey;
  private readonly tron: HDKey;

  public constructor(xpubs: AccountXpubs) {
    this.ethereum = parseAccountXpub(xpubs.ethereum);
    this.tron = parseAccountXpub(xpubs.tron);
  }

  public async deriveDepositAddress(input: { derivationIndex: number; keyVersion: number; network: string }): Promise<string> {
    const account = this.accountFor(input.network);
    const child = account.derive(`m/0/${input.derivationIndex}`);
    if (!child.publicKey) throw new DomainError('signer_backend_failed');
    if (isEthereumNetwork(input.network)) return ethereumAddress(child.publicKey);
    if (isTronNetwork(input.network)) return tronAddress(child.publicKey);
    throw new DomainError('signer_network_forbidden');
  }

  private accountFor(network: string): HDKey {
    if (isEthereumNetwork(network)) return this.ethereum;
    if (isTronNetwork(network)) return this.tron;
    throw new DomainError('signer_network_forbidden');
  }
}

function parseAccountXpub(value: string): HDKey {
  if (!value.startsWith('xpub')) throw new DomainError('signer_xpub_required');
  let key: HDKey;
  try {
    key = HDKey.fromExtendedKey(value);
  } catch {
    throw new DomainError('signer_xpub_required');
  }
  if (key.privateKey) throw new DomainError('signer_xpub_required');
  return key;
}

function isEthereumNetwork(network: string): boolean {
  return network === 'ethereum' || network.startsWith('ethereum-');
}

function isTronNetwork(network: string): boolean {
  return network === 'tron' || network.startsWith('tron-');
}

function ethereumAddress(compressedPublicKey: Uint8Array): string {
  return `0x${bytesToHex(keccakAddress(compressedPublicKey))}`;
}

function tronAddress(compressedPublicKey: Uint8Array): string {
  const payload = new Uint8Array(21);
  payload[0] = 0x41;
  payload.set(keccakAddress(compressedPublicKey), 1);
  return b58check.encode(payload);
}

function keccakAddress(compressedPublicKey: Uint8Array): Uint8Array {
  const uncompressed = secp256k1.Point.fromBytes(compressedPublicKey).toBytes(false);
  return keccak_256(uncompressed.subarray(1)).subarray(-20);
}
