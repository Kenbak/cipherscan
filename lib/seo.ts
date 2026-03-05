import { cache } from 'react';

type Network = 'mainnet' | 'testnet' | 'crosslink-testnet';

function getNetwork(): Network {
  return (process.env.NEXT_PUBLIC_NETWORK as Network) || 'testnet';
}

function getBaseUrl(): string {
  const network = getNetwork();
  return network === 'mainnet'
    ? 'https://cipherscan.app'
    : 'https://testnet.cipherscan.app';
}

function getApiUrl(): string {
  const network = getNetwork();
  const urls: Record<Network, string> = {
    mainnet: 'https://api.mainnet.cipherscan.app',
    testnet: 'https://api.testnet.cipherscan.app',
    'crosslink-testnet': process.env.NEXT_PUBLIC_CROSSLINK_API_URL || 'https://api.testnet.cipherscan.app',
  };
  return urls[network];
}

export { getBaseUrl };

// --- Block metadata ---

export interface BlockMeta {
  height: number;
  hash: string;
  timestamp: number;
  transactionCount: number;
  size: number;
}

export const getBlockMeta = cache(async (height: string): Promise<BlockMeta | null> => {
  try {
    const res = await fetch(`${getApiUrl()}/api/block/${height}`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      height: parseInt(data.height),
      hash: data.hash,
      timestamp: parseInt(data.timestamp),
      transactionCount: data.transactionCount || (data.transactions?.length ?? 0),
      size: parseInt(data.size),
    };
  } catch {
    return null;
  }
});

// --- Transaction metadata ---

export interface TxMeta {
  txid: string;
  blockHeight: number;
  timestamp: number;
  confirmations: number;
  isCoinbase: boolean;
  hasShielded: boolean;
  orchardActions: number;
  shieldedSpends: number;
  shieldedOutputs: number;
  fee: number;
}

export const getTxMeta = cache(async (txid: string): Promise<TxMeta | null> => {
  try {
    const res = await fetch(`${getApiUrl()}/api/tx/${txid}`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      txid: data.txid,
      blockHeight: data.blockHeight,
      timestamp: parseInt(data.blockTime),
      confirmations: parseInt(data.confirmations),
      isCoinbase: data.isCoinbase || false,
      hasShielded: data.hasSapling || data.hasShielded || false,
      orchardActions: data.orchardActions || 0,
      shieldedSpends: data.shieldedSpends || 0,
      shieldedOutputs: data.shieldedOutputs || 0,
      fee: data.fee || 0,
    };
  } catch {
    return null;
  }
});

// --- Address metadata ---

export interface AddressMeta {
  address: string;
  balance: number;
  type: 'shielded' | 'transparent' | 'unified';
  txCount: number;
  isShielded: boolean;
}

export const getAddressMeta = cache(async (address: string): Promise<AddressMeta | null> => {
  try {
    const res = await fetch(`${getApiUrl()}/api/address/${address}?limit=1`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = await res.json();

    const isShielded = data.type === 'shielded' || (data.note && (
      data.note.includes('Shielded address') ||
      data.note.includes('Fully shielded')
    ));

    return {
      address: data.address,
      balance: (data.balance || 0) / 100000000,
      type: data.type || 'transparent',
      txCount: data.txCount || data.transactionCount || 0,
      isShielded,
    };
  } catch {
    return null;
  }
});

// --- Helpers ---

export function truncateHash(hash: string, start = 10, end = 6): string {
  if (hash.length <= start + end + 3) return hash;
  return `${hash.slice(0, start)}...${hash.slice(-end)}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}
