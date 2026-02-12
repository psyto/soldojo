import { clusterApiUrl } from '@solana/web3.js';

export const SOLANA_NETWORK = (process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet') as 'devnet' | 'mainnet-beta' | 'testnet';

export const SOLANA_RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_HELIUS_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  clusterApiUrl(SOLANA_NETWORK);

export const EXPLORER_BASE_URL = SOLANA_NETWORK === 'mainnet-beta'
  ? 'https://explorer.solana.com'
  : `https://explorer.solana.com?cluster=${SOLANA_NETWORK}`;

export function getExplorerUrl(type: 'address' | 'tx', value: string): string {
  const suffix = SOLANA_NETWORK === 'mainnet-beta' ? '' : `?cluster=${SOLANA_NETWORK}`;
  return `https://explorer.solana.com/${type}/${value}${suffix}`;
}
