import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { HDKey } from '@scure/bip32';
import { base58check, base58xrp, bech32 } from '@scure/base';

import {
  isBitcoinProductNetwork,
  isEvmProductNetwork,
  isTronProductNetwork,
  isXrpProductNetwork,
} from './product-networks.js';
import { DomainError } from './domain-errors.js';
import type { DepositAddressBackend } from './deposit-address-service.js';

const b58check = base58check(sha256);

export type AccountXpubs = {
  bitcoin: string;
  ethereum: string;
  tron: string;
  xrp: string;
};

export class XpubDepositBackend implements DepositAddressBackend {
  private readonly bitcoin: HDKey;
  private readonly ethereum: HDKey;
  private readonly tron: HDKey;
  private readonly xrp: HDKey;

  public constructor(xpubs: AccountXpubs) {
    this.bitcoin = parseAccountXpub(xpubs.bitcoin);
    this.ethereum = parseAccountXpub(xpubs.ethereum);
    this.tron = parseAccountXpub(xpubs.tron);
    this.xrp = parseAccountXpub(xpubs.xrp);
  }

  public async deriveDepositAddress(input: { derivationIndex: number; keyVersion: number; network: string }): Promise<string> {
    const account = this.accountFor(input.network);
    const child = account.derive(`m/0/${input.derivationIndex}`);
    if (!child.publicKey) throw new DomainError('signer_backend_failed');
    if (isEvmProductNetwork(input.network)) return ethereumAddress(child.publicKey);
    if (isTronProductNetwork(input.network)) return tronAddress(child.publicKey);
    if (isBitcoinProductNetwork(input.network)) return bitcoinTestnetAddress(child.publicKey);
    if (isXrpProductNetwork(input.network)) return xrpClassicAddress(child.publicKey);
    throw new DomainError('signer_network_forbidden');
  }

  private accountFor(network: string): HDKey {
    if (isEvmProductNetwork(network)) return this.ethereum;
    if (isTronProductNetwork(network)) return this.tron;
    if (isBitcoinProductNetwork(network)) return this.bitcoin;
    if (isXrpProductNetwork(network)) return this.xrp;
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

function ethereumAddress(compressedPublicKey: Uint8Array): string {
  return `0x${bytesToHex(keccakAddress(compressedPublicKey))}`;
}

function tronAddress(compressedPublicKey: Uint8Array): string {
  const payload = new Uint8Array(21);
  payload[0] = 0x41;
  payload.set(keccakAddress(compressedPublicKey), 1);
  return b58check.encode(payload);
}

function bitcoinTestnetAddress(compressedPublicKey: Uint8Array): string {
  const hash = ripemd160(sha256(compressedPublicKey));
  return bech32.encode('tb', [0, ...bech32.toWords(hash)]);
}

function xrpClassicAddress(compressedPublicKey: Uint8Array): string {
  const payload = new Uint8Array(21);
  payload[0] = 0x00;
  payload.set(ripemd160(sha256(compressedPublicKey)), 1);
  const encoded = new Uint8Array(25);
  encoded.set(payload, 0);
  encoded.set(sha256(sha256(payload)).subarray(0, 4), 21);
  return base58xrp.encode(encoded);
}

function keccakAddress(compressedPublicKey: Uint8Array): Uint8Array {
  const uncompressed = secp256k1.Point.fromBytes(compressedPublicKey).toBytes(false);
  return keccak_256(uncompressed.subarray(1)).subarray(-20);
}
