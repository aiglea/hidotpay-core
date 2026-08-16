const EVM = new Set([
  'ethereum', 'ethereum-sepolia', 'bnb', 'bsc', 'bnb-testnet', 'polygon', 'polygon-amoy',
  'arbitrum', 'arbitrum-sepolia', 'optimism', 'optimism-sepolia', 'base', 'base-sepolia',
  'avalanche', 'avalanche-fuji', 'linea', 'linea-sepolia', 'scroll', 'scroll-sepolia',
]);
const TRON = new Set(['tron', 'tron-shasta']);
const BITCOIN = new Set(['bitcoin', 'bitcoin-testnet4']);
const XRP = new Set(['xrp', 'xrpl', 'xrpl-testnet']);
const SOLANA = new Set(['solana', 'solana-devnet']);
const TON = new Set(['ton', 'ton-testnet']);
const STELLAR = new Set(['stellar', 'xlm', 'stellar-testnet']);

export const SIGNER_ALLOWED_NETWORKS = Object.freeze([
  ...EVM, ...TRON, ...BITCOIN, ...XRP, ...SOLANA, ...TON, ...STELLAR,
]);

export const isEvmProductNetwork = (network: string) => EVM.has(network);
export const isTronProductNetwork = (network: string) => TRON.has(network);
export const isBitcoinProductNetwork = (network: string) => BITCOIN.has(network);
export const isXrpProductNetwork = (network: string) => XRP.has(network);
export const isSolanaProductNetwork = (network: string) => SOLANA.has(network);
export const isTonProductNetwork = (network: string) => TON.has(network);
export const isStellarProductNetwork = (network: string) => STELLAR.has(network);
