import type { UnifiedAddressComponents } from '@/lib/wasm-loader';

export interface PriceData {
  price: number;
  change24h: number;
}

export interface Transaction {
  txid: string;
  timestamp: number;
  amount: number;
  type: 'received' | 'sent';
  memo?: string;
  blockHeight?: number;
  from?: string | null;
  to?: string | null;
  isCoinbase?: boolean;
  isShielded?: boolean;
  isDeshielding?: boolean;
  isShielding?: boolean;
}

export interface AddressData {
  address: string;
  balance: number;
  type: 'shielded' | 'transparent' | 'unified';
  transactions: Transaction[];
  transactionCount?: number;
  note?: string;
  firstSeen?: number | null;
  lastSeen?: number | null;
  firstFunding?: FirstFunding | null;
}

export interface FirstFunding {
  txid: string;
  blockTime: number;
  amountZec: number;
  funderAddress: string | null;
  funderLabel: string | null;
  isCoinbase: boolean;
}

export interface CrossChainSwap {
  id: string;
  direction: string;
  sourceChain: string;
  sourceToken: string;
  sourceAmount: number;
  sourceAmountUsd: number;
  destChain: string;
  destToken: string;
  destAmount: number;
  destAmountUsd: number;
  zecTxid: string;
  timestamp: number;
}

export interface CrossChainActivity {
  totalSwaps: number;
  totalVolumeUsd: number;
  entryCount: number;
  exitCount: number;
  swaps: CrossChainSwap[];
}

export type AddressTab = 'transactions' | 'crosschain' | 'graph';

export type UnifiedAddressTab = 'unified' | 'transparent' | 'sapling' | 'orchard';

export type { UnifiedAddressComponents };
