import assert from 'node:assert/strict';
import test from 'node:test';

import {
  V1_PRODUCT_CHAINS,
  V1_TESTNET_NETWORKS,
  creditLiveChains,
  officialTestnetDepositNetworks,
} from '../../src/domain/product-chains.js';

test('V1 product chains are the 15 networks from wallet_security_plan section 21', () => {
  assert.deepEqual(V1_PRODUCT_CHAINS.map((chain) => chain.product), [
    'ethereum',
    'bnb-chain',
    'polygon',
    'arbitrum',
    'optimism',
    'base',
    'avalanche',
    'linea',
    'scroll',
    'tron',
    'bitcoin',
    'solana',
    'ton',
    'xrp-ledger',
    'stellar',
  ]);
  assert.equal(V1_PRODUCT_CHAINS.length, 15);
  assert.deepEqual([...V1_TESTNET_NETWORKS].sort(), [
    'arbitrum-sepolia',
    'avalanche-fuji',
    'base-sepolia',
    'bitcoin-testnet4',
    'bnb-testnet',
    'ethereum-sepolia',
    'linea-sepolia',
    'optimism-sepolia',
    'polygon-amoy',
    'scroll-sepolia',
    'solana-devnet',
    'stellar-testnet',
    'ton-testnet',
    'tron-shasta',
    'xrpl-testnet',
  ]);
});

test('every V1 chain has a testnet name, family, listed asset, and Traditional Chinese label', () => {
  for (const chain of V1_PRODUCT_CHAINS) {
    assert.match(chain.testnet, /^[a-z0-9][a-z0-9-]{1,62}$/);
    assert.match(chain.family, /^(evm|tron|bitcoin|solana|ton|xrp|stellar)$/);
    assert.match(chain.assetCode, /^[A-Z]{2,8}$/);
    assert.match(chain.testnetLabelZh, /\S/);
    assert.match(chain.productLabelZh, /\S/);
    assert.ok(chain.minimumConfirmations >= 1);
    assert.doesNotMatch(chain.testnet, /mainnet/);
  }
});

test('official testnet credit allow-list is exactly the V1 testnets and never includes mainnet', () => {
  assert.deepEqual([...officialTestnetDepositNetworks()].sort(), [...V1_TESTNET_NETWORKS].sort());
  for (const network of officialTestnetDepositNetworks()) {
    assert.doesNotMatch(network, /mainnet/);
  }
});

test('Circle official test USDC is credit-live on Amoy, Arbitrum, OP and Linea Sepolia', () => {
  const live = Object.fromEntries(creditLiveChains().map((chain) => [chain.testnet, chain]));
  assert.equal(live['polygon-amoy']?.assetCode, 'USDC');
  assert.equal(live['polygon-amoy']?.testnetContract, '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582');
  assert.equal(live['arbitrum-sepolia']?.testnetContract, '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d');
  assert.equal(live['optimism-sepolia']?.testnetContract, '0x5fd84259d66Cd46123540766Be93DFE6D43130D7');
  assert.equal(live['linea-sepolia']?.testnetContract, '0xFEce4462D57bD51A6A552365A011b95f0E16d9B7');
  for (const network of ['bnb-testnet', 'scroll-sepolia', 'ton-testnet']) {
    assert.equal(live[network], undefined);
  }
  assert.doesNotMatch(creditLiveChains().map((chain) => chain.testnetContract).join(' '), /0xdAC17F|0xA0b86991|TR7NHq/i);
});
