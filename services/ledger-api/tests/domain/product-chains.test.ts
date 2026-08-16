import assert from 'node:assert/strict';
import test from 'node:test';

import {
  V1_PRODUCT_CHAINS,
  V1_TESTNET_NETWORKS,
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
