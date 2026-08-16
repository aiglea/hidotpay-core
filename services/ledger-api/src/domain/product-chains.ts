export type ChainFamily = 'evm' | 'tron' | 'bitcoin' | 'solana' | 'ton' | 'xrp' | 'stellar';
export type DerivationKind = 'evm-xpub' | 'tron-xpub' | 'btc-xpub' | 'xrp-xpub' | 'sol-table' | 'ton-table' | 'xlm-table';

export type ProductChain = {
  aliases: readonly string[];
  assetCode: string;
  assetDecimals: number;
  badge: string;
  chainIdentifier: string;
  creditBlockerZh?: string;
  creditLive: boolean;
  derivation: DerivationKind;
  evmChainId?: number;
  family: ChainFamily;
  feeAssetCode: string;
  minimumConfirmations: number;
  product: string;
  productLabelZh: string;
  rpcUrls: readonly string[];
  testnet: string;
  testnetContract?: string;
  testnetDescriptionZh: string;
  testnetLabelZh: string;
};

/**
 * First-version product chains from wallet_security_plan.md §21.
 * V1.5 / V2 families are intentionally excluded.
 */
export const V1_PRODUCT_CHAINS: readonly ProductChain[] = Object.freeze([
  {
    aliases: Object.freeze(['ethereum']),
    assetCode: 'USDT',
    assetDecimals: 6,
    badge: 'ETH',
    chainIdentifier: '11155111',
    creditLive: true,
    derivation: 'evm-xpub',
    evmChainId: 11155111,
    family: 'evm',
    feeAssetCode: 'ETH',
    minimumConfirmations: 12,
    product: 'ethereum',
    productLabelZh: 'Ethereum',
    rpcUrls: Object.freeze([
      'https://ethereum-sepolia-rpc.publicnode.com',
      'https://1rpc.io/sepolia',
      'https://gateway.tenderly.co/public/sepolia',
    ]),
    testnet: 'ethereum-sepolia',
    testnetContract: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
    testnetDescriptionZh: '測試網 ERC-20 USDT · 不是 Tether 主網',
    testnetLabelZh: 'Ethereum Sepolia',
  },
  {
    aliases: Object.freeze(['bnb', 'bsc']),
    assetCode: 'USDT',
    assetDecimals: 6,
    badge: 'BNB',
    chainIdentifier: '97',
    creditBlockerZh: '公開測試網沒有已驗證的 Tether／常用 USDT 合約，地址可配置但不會入帳。',
    creditLive: false,
    derivation: 'evm-xpub',
    evmChainId: 97,
    family: 'evm',
    feeAssetCode: 'BNB',
    minimumConfirmations: 15,
    product: 'bnb-chain',
    productLabelZh: 'BNB Chain',
    rpcUrls: Object.freeze([
      'https://bsc-testnet-rpc.publicnode.com',
      'https://bsc-testnet.public.blastapi.io',
    ]),
    testnet: 'bnb-testnet',
    testnetDescriptionZh: '可取得地址 · 尚無已驗證測試 USDT，轉入不會入帳',
    testnetLabelZh: 'BNB Chain 測試網',
  },
  {
    aliases: Object.freeze(['polygon']),
    assetCode: 'USDT',
    assetDecimals: 6,
    badge: 'POL',
    chainIdentifier: '80002',
    creditBlockerZh: 'Polygon Amoy 沒有已驗證的公開測試 USDT 合約，地址可配置但不會入帳。',
    creditLive: false,
    derivation: 'evm-xpub',
    evmChainId: 80002,
    family: 'evm',
    feeAssetCode: 'POL',
    minimumConfirmations: 64,
    product: 'polygon',
    productLabelZh: 'Polygon',
    rpcUrls: Object.freeze([
      'https://polygon-amoy-bor-rpc.publicnode.com',
    ]),
    testnet: 'polygon-amoy',
    testnetDescriptionZh: '可取得地址 · 尚無已驗證測試 USDT，轉入不會入帳',
    testnetLabelZh: 'Polygon Amoy',
  },
  {
    aliases: Object.freeze(['arbitrum']),
    assetCode: 'USDT',
    assetDecimals: 6,
    badge: 'ARB',
    chainIdentifier: '421614',
    creditBlockerZh: 'Arbitrum Sepolia 沒有已驗證的公開測試 USDT 合約，地址可配置但不會入帳。',
    creditLive: false,
    derivation: 'evm-xpub',
    evmChainId: 421614,
    family: 'evm',
    feeAssetCode: 'ETH',
    minimumConfirmations: 20,
    product: 'arbitrum',
    productLabelZh: 'Arbitrum',
    rpcUrls: Object.freeze([
      'https://arbitrum-sepolia-rpc.publicnode.com',
    ]),
    testnet: 'arbitrum-sepolia',
    testnetDescriptionZh: '可取得地址 · 尚無已驗證測試 USDT，轉入不會入帳',
    testnetLabelZh: 'Arbitrum Sepolia',
  },
  {
    aliases: Object.freeze(['optimism']),
    assetCode: 'USDT',
    assetDecimals: 6,
    badge: 'OP',
    chainIdentifier: '11155420',
    creditBlockerZh: 'Optimism Sepolia 沒有已驗證的公開測試 USDT 合約，地址可配置但不會入帳。',
    creditLive: false,
    derivation: 'evm-xpub',
    evmChainId: 11155420,
    family: 'evm',
    feeAssetCode: 'ETH',
    minimumConfirmations: 20,
    product: 'optimism',
    productLabelZh: 'Optimism',
    rpcUrls: Object.freeze([
      'https://optimism-sepolia-rpc.publicnode.com',
      'https://sepolia.optimism.io',
    ]),
    testnet: 'optimism-sepolia',
    testnetDescriptionZh: '可取得地址 · 尚無已驗證測試 USDT，轉入不會入帳',
    testnetLabelZh: 'Optimism Sepolia',
  },
  {
    aliases: Object.freeze(['base']),
    assetCode: 'USDC',
    assetDecimals: 6,
    badge: 'BASE',
    chainIdentifier: '84532',
    creditLive: true,
    derivation: 'evm-xpub',
    evmChainId: 84532,
    family: 'evm',
    feeAssetCode: 'ETH',
    minimumConfirmations: 20,
    product: 'base',
    productLabelZh: 'Base',
    rpcUrls: Object.freeze([
      'https://base-sepolia-rpc.publicnode.com',
      'https://sepolia.base.org',
    ]),
    testnet: 'base-sepolia',
    testnetContract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    testnetDescriptionZh: '測試網 Circle USDC · 規格指定 Base 資產',
    testnetLabelZh: 'Base Sepolia',
  },
  {
    aliases: Object.freeze(['avalanche']),
    assetCode: 'USDT',
    assetDecimals: 6,
    badge: 'AVAX',
    chainIdentifier: '43113',
    creditLive: true,
    derivation: 'evm-xpub',
    evmChainId: 43113,
    family: 'evm',
    feeAssetCode: 'AVAX',
    minimumConfirmations: 12,
    product: 'avalanche',
    productLabelZh: 'Avalanche C-Chain',
    rpcUrls: Object.freeze([
      'https://avalanche-fuji-c-chain-rpc.publicnode.com',
      'https://api.avax-test.network/ext/bc/C/rpc',
    ]),
    testnet: 'avalanche-fuji',
    testnetContract: '0xAb231A5744C8E6c45481754928cCfFFFD4aa0732',
    testnetDescriptionZh: 'Fuji 測試 USDT · 不是 Tether 主網',
    testnetLabelZh: 'Avalanche Fuji',
  },
  {
    aliases: Object.freeze(['linea']),
    assetCode: 'USDT',
    assetDecimals: 6,
    badge: 'LINEA',
    chainIdentifier: '59141',
    creditBlockerZh: 'Linea Sepolia 沒有已驗證的公開測試 USDT 合約，地址可配置但不會入帳。',
    creditLive: false,
    derivation: 'evm-xpub',
    evmChainId: 59141,
    family: 'evm',
    feeAssetCode: 'ETH',
    minimumConfirmations: 20,
    product: 'linea',
    productLabelZh: 'Linea',
    rpcUrls: Object.freeze([
      'https://linea-sepolia-rpc.publicnode.com',
      'https://rpc.sepolia.linea.build',
    ]),
    testnet: 'linea-sepolia',
    testnetDescriptionZh: '可取得地址 · 尚無已驗證測試 USDT，轉入不會入帳',
    testnetLabelZh: 'Linea Sepolia',
  },
  {
    aliases: Object.freeze(['scroll']),
    assetCode: 'USDT',
    assetDecimals: 6,
    badge: 'SCRL',
    chainIdentifier: '534351',
    creditBlockerZh: 'Scroll Sepolia 沒有已驗證的公開測試 USDT 合約，地址可配置但不會入帳。',
    creditLive: false,
    derivation: 'evm-xpub',
    evmChainId: 534351,
    family: 'evm',
    feeAssetCode: 'ETH',
    minimumConfirmations: 20,
    product: 'scroll',
    productLabelZh: 'Scroll',
    rpcUrls: Object.freeze([
      'https://scroll-sepolia-rpc.publicnode.com',
      'https://sepolia-rpc.scroll.io',
    ]),
    testnet: 'scroll-sepolia',
    testnetDescriptionZh: '可取得地址 · 尚無已驗證測試 USDT，轉入不會入帳',
    testnetLabelZh: 'Scroll Sepolia',
  },
  {
    aliases: Object.freeze(['tron']),
    assetCode: 'USDT',
    assetDecimals: 6,
    badge: 'TRX',
    chainIdentifier: '0000000000000000de1aa88295e1fcf982742f773e0419c5a9c134c994a9059e',
    creditLive: true,
    derivation: 'tron-xpub',
    family: 'tron',
    feeAssetCode: 'TRX',
    minimumConfirmations: 19,
    product: 'tron',
    productLabelZh: 'TRON',
    rpcUrls: Object.freeze(['https://api.shasta.trongrid.io']),
    testnet: 'tron-shasta',
    testnetContract: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj',
    testnetDescriptionZh: '測試網 TRC-20 USDT · 不是主網',
    testnetLabelZh: 'TRON Shasta',
  },
  {
    aliases: Object.freeze(['bitcoin']),
    assetCode: 'BTC',
    assetDecimals: 8,
    badge: 'BTC',
    chainIdentifier: 'testnet4',
    creditLive: true,
    derivation: 'btc-xpub',
    family: 'bitcoin',
    feeAssetCode: 'BTC',
    minimumConfirmations: 3,
    product: 'bitcoin',
    productLabelZh: 'Bitcoin',
    rpcUrls: Object.freeze(['https://mempool.space/testnet4/api']),
    testnet: 'bitcoin-testnet4',
    testnetContract: 'native:btc',
    testnetDescriptionZh: 'Testnet4 原生 BTC · 不是 USDT',
    testnetLabelZh: 'Bitcoin Testnet4',
  },
  {
    aliases: Object.freeze(['solana']),
    assetCode: 'USDC',
    assetDecimals: 6,
    badge: 'SOL',
    chainIdentifier: 'devnet',
    creditLive: true,
    derivation: 'sol-table',
    family: 'solana',
    feeAssetCode: 'SOL',
    minimumConfirmations: 32,
    product: 'solana',
    productLabelZh: 'Solana',
    rpcUrls: Object.freeze([
      'https://api.devnet.solana.com',
      'https://solana-devnet-rpc.publicnode.com',
    ]),
    testnet: 'solana-devnet',
    testnetContract: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    testnetDescriptionZh: 'Devnet Circle USDC · 官方測試 USDT 不存在',
    testnetLabelZh: 'Solana Devnet',
  },
  {
    aliases: Object.freeze(['ton']),
    assetCode: 'USDT',
    assetDecimals: 6,
    badge: 'TON',
    chainIdentifier: 'testnet',
    creditBlockerZh: 'TON 測試網沒有已驗證的公開 USDT jetton，地址可配置但不會入帳。',
    creditLive: false,
    derivation: 'ton-table',
    family: 'ton',
    feeAssetCode: 'TON',
    minimumConfirmations: 16,
    product: 'ton',
    productLabelZh: 'TON',
    rpcUrls: Object.freeze(['https://testnet.toncenter.com/api/v2/jsonRPC']),
    testnet: 'ton-testnet',
    testnetDescriptionZh: '可取得地址 · 尚無已驗證測試 USDT，轉入不會入帳',
    testnetLabelZh: 'TON Testnet',
  },
  {
    aliases: Object.freeze(['xrp', 'xrpl']),
    assetCode: 'XRP',
    assetDecimals: 6,
    badge: 'XRP',
    chainIdentifier: 'testnet',
    creditLive: true,
    derivation: 'xrp-xpub',
    family: 'xrp',
    feeAssetCode: 'XRP',
    minimumConfirmations: 1,
    product: 'xrp-ledger',
    productLabelZh: 'XRP Ledger',
    rpcUrls: Object.freeze(['https://testnet.xrpl-labs.com']),
    testnet: 'xrpl-testnet',
    testnetContract: 'native:xrp',
    testnetDescriptionZh: '測試網原生 XRP · 不是 USDT',
    testnetLabelZh: 'XRP Ledger Testnet',
  },
  {
    aliases: Object.freeze(['stellar', 'xlm']),
    assetCode: 'USDC',
    assetDecimals: 6,
    badge: 'XLM',
    chainIdentifier: 'testnet',
    creditLive: true,
    derivation: 'xlm-table',
    family: 'stellar',
    feeAssetCode: 'XLM',
    minimumConfirmations: 1,
    product: 'stellar',
    productLabelZh: 'Stellar',
    rpcUrls: Object.freeze(['https://horizon-testnet.stellar.org']),
    testnet: 'stellar-testnet',
    testnetContract: 'USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    testnetDescriptionZh: '測試網 Circle USDC · 規格指定 Stellar 資產',
    testnetLabelZh: 'Stellar Testnet',
  },
]);

export const V1_TESTNET_NETWORKS = Object.freeze(new Set(V1_PRODUCT_CHAINS.map((chain) => chain.testnet)));

export function officialTestnetDepositNetworks(): ReadonlySet<string> {
  return V1_TESTNET_NETWORKS;
}

export function productChainByTestnet(network: string): ProductChain | undefined {
  return V1_PRODUCT_CHAINS.find((chain) => chain.testnet === network);
}

export function depositAddressAliases(network: string): readonly string[] {
  const chain = productChainByTestnet(network);
  if (!chain) return [network];
  return [chain.testnet, ...chain.aliases];
}

export function signerAllowedNetworks(): readonly string[] {
  return V1_PRODUCT_CHAINS.flatMap((chain) => [chain.testnet, ...chain.aliases]);
}

export function creditLiveChains(): readonly ProductChain[] {
  return V1_PRODUCT_CHAINS.filter((chain) => chain.creditLive && Boolean(chain.testnetContract));
}

export function isEvmProductNetwork(network: string): boolean {
  return V1_PRODUCT_CHAINS.some((chain) => chain.family === 'evm' && (chain.testnet === network || chain.aliases.includes(network)));
}

export function isTronProductNetwork(network: string): boolean {
  return V1_PRODUCT_CHAINS.some((chain) => chain.family === 'tron' && (chain.testnet === network || chain.aliases.includes(network)));
}

export function isBitcoinProductNetwork(network: string): boolean {
  return V1_PRODUCT_CHAINS.some((chain) => chain.family === 'bitcoin' && (chain.testnet === network || chain.aliases.includes(network)));
}

export function isXrpProductNetwork(network: string): boolean {
  return V1_PRODUCT_CHAINS.some((chain) => chain.family === 'xrp' && (chain.testnet === network || chain.aliases.includes(network)));
}

export function isSolanaProductNetwork(network: string): boolean {
  return V1_PRODUCT_CHAINS.some((chain) => chain.family === 'solana' && (chain.testnet === network || chain.aliases.includes(network)));
}

export function isTonProductNetwork(network: string): boolean {
  return V1_PRODUCT_CHAINS.some((chain) => chain.family === 'ton' && (chain.testnet === network || chain.aliases.includes(network)));
}

export function isStellarProductNetwork(network: string): boolean {
  return V1_PRODUCT_CHAINS.some((chain) => chain.family === 'stellar' && (chain.testnet === network || chain.aliases.includes(network)));
}
