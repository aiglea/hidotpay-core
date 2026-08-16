export type WalletNetwork = {
  assetCode: string;
  badge: string;
  creditLive: boolean;
  id: string;
  name: string;
  description: string;
};

export const WALLET_NETWORKS: readonly WalletNetwork[] = Object.freeze([
  { id: 'ethereum-sepolia', name: 'Ethereum Sepolia', badge: 'ETH', assetCode: 'USDT', creditLive: true, description: '測試網 ERC-20 USDT · 不是 Tether 主網' },
  { id: 'bnb-testnet', name: 'BNB Chain 測試網', badge: 'BNB', assetCode: 'USDT', creditLive: false, description: '可取得地址 · 尚無已驗證測試 USDT，轉入不會入帳' },
  { id: 'polygon-amoy', name: 'Polygon Amoy', badge: 'POL', assetCode: 'USDC', creditLive: true, description: '測試網 Circle USDC · 不是 USDT' },
  { id: 'arbitrum-sepolia', name: 'Arbitrum Sepolia', badge: 'ARB', assetCode: 'USDC', creditLive: true, description: '測試網 Circle USDC · 不是 USDT' },
  { id: 'optimism-sepolia', name: 'Optimism Sepolia', badge: 'OP', assetCode: 'USDC', creditLive: true, description: '測試網 Circle USDC · 不是 USDT' },
  { id: 'base-sepolia', name: 'Base Sepolia', badge: 'BASE', assetCode: 'USDC', creditLive: true, description: '測試網 Circle USDC · 規格指定 Base 資產' },
  { id: 'avalanche-fuji', name: 'Avalanche Fuji', badge: 'AVAX', assetCode: 'USDT', creditLive: true, description: 'Fuji 測試 USDT · 不是 Tether 主網' },
  { id: 'linea-sepolia', name: 'Linea Sepolia', badge: 'LINEA', assetCode: 'USDC', creditLive: true, description: '測試網 Circle USDC · 不是 USDT' },
  { id: 'scroll-sepolia', name: 'Scroll Sepolia', badge: 'SCRL', assetCode: 'USDT', creditLive: false, description: '可取得地址 · 尚無已驗證測試 USDT，轉入不會入帳' },
  { id: 'tron-shasta', name: 'TRON Shasta', badge: 'TRX', assetCode: 'USDT', creditLive: true, description: '測試網 TRC-20 USDT · 不是主網' },
  { id: 'bitcoin-testnet4', name: 'Bitcoin Testnet4', badge: 'BTC', assetCode: 'BTC', creditLive: true, description: 'Testnet4 原生 BTC · 不是 USDT' },
  { id: 'solana-devnet', name: 'Solana Devnet', badge: 'SOL', assetCode: 'USDC', creditLive: true, description: 'Devnet Circle USDC · 官方測試 USDT 不存在' },
  { id: 'ton-testnet', name: 'TON Testnet', badge: 'TON', assetCode: 'USDT', creditLive: false, description: '可取得地址 · 尚無已驗證測試 USDT，轉入不會入帳' },
  { id: 'xrpl-testnet', name: 'XRP Ledger Testnet', badge: 'XRP', assetCode: 'XRP', creditLive: true, description: '測試網原生 XRP · 不是 USDT' },
  { id: 'stellar-testnet', name: 'Stellar Testnet', badge: 'XLM', assetCode: 'USDC', creditLive: true, description: '測試網 Circle USDC · 規格指定 Stellar 資產' },
]);

export function walletNetwork(id: string): WalletNetwork | undefined {
  return WALLET_NETWORKS.find((network) => network.id === id);
}
