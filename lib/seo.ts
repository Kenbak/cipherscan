import { cache } from 'react';
import type { Metadata } from 'next';
import {
  getConfiguredNetwork,
  normalizeApiBaseUrl,
  type AppNetwork,
} from '@/lib/network';

export type SeoNetwork = AppNetwork;

export function getNetwork(): SeoNetwork {
  const configured = getConfiguredNetwork();
  if (configured) return configured;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_NETWORK must be set to mainnet, testnet, or crosslink-testnet for production builds.',
    );
  }

  // Local development has historically defaulted to testnet. Production
  // builds fail above so a missing setting cannot publish the wrong network.
  return 'testnet';
}

export function getBaseUrl(): string {
  const network = getNetwork();
  const urls: Record<SeoNetwork, string> = {
    mainnet: 'https://cipherscan.app',
    testnet: 'https://testnet.cipherscan.app',
    'crosslink-testnet': 'https://crosslink.cipherscan.app',
  };
  return urls[network];
}

export function getApiUrl(): string {
  const network = getNetwork();
  const urls: Record<SeoNetwork, string> = {
    mainnet: 'https://api.mainnet.cipherscan.app',
    testnet: 'https://api.testnet.cipherscan.app',
    'crosslink-testnet': process.env.NEXT_PUBLIC_CROSSLINK_API_URL || 'https://api.crosslink.cipherscan.app',
  };
  return normalizeApiBaseUrl(urls[network]);
}

function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path === '/' ? '/' : `/${path.replace(/^\/+/, '')}`;
  return new URL(normalizedPath, `${getBaseUrl()}/`).toString();
}

export interface BuildPageMetadataOptions {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  index?: boolean;
  type?: 'website' | 'article';
  imageAlt?: string;
  networks?: SeoNetwork[];
  indexOnTestnet?: boolean;
  canonical?: boolean;
}

/**
 * Build a complete, network-aware metadata object for a public page.
 *
 * Next.js replaces nested metadata objects instead of deeply merging them,
 * so every page must emit complete Open Graph and Twitter objects. Crosslink
 * remains noindex even if a caller accidentally opts a page into indexing.
 */
export function buildPageMetadata({
  title,
  description,
  path,
  keywords,
  index,
  type = 'website',
  imageAlt,
  networks,
  indexOnTestnet = false,
  canonical: includeCanonical = true,
}: BuildPageMetadataOptions): Metadata {
  const network = getNetwork();
  const canonical = absoluteUrl(path);
  const image = absoluteUrl('/og-image.png?v=2');
  const isCrosslink = network === 'crosslink-testnet';
  const allowedOnNetwork = networks ? networks.includes(network) : true;
  // Testnet is a developer utility rather than a second copy of the explorer
  // index. Its homepage is the only default opt-in; any future testnet landing
  // page must make a deliberate, reviewed indexOnTestnet decision.
  const allowedOnTestnet = network !== 'testnet' || indexOnTestnet;
  const shouldIndex = !isCrosslink
    && allowedOnNetwork
    && allowedOnTestnet
    && (index ?? true);
  // noindex pages may still pass discovery and relationship signals through
  // their normal links. Crosslink is separately blocked in robots.ts while
  // that deployment remains closed to crawling.
  const shouldFollow = true;
  const openGraphBase = {
    title,
    description,
    url: canonical,
    siteName: 'CipherScan',
    locale: 'en_US',
    images: [
      {
        url: image,
        width: 1051,
        height: 520,
        alt: imageAlt || `${title} — CipherScan`,
      },
    ],
  };
  const openGraph: Metadata['openGraph'] = type === 'article'
    ? { ...openGraphBase, type: 'article' }
    : { ...openGraphBase, type: 'website' };

  return {
    metadataBase: new URL(getBaseUrl()),
    title,
    description,
    ...(keywords?.length ? { keywords } : {}),
    // `null` explicitly clears a canonical inherited from the root layout on
    // invalid or authoritatively missing resources.
    alternates: { canonical: includeCanonical ? canonical : null },
    openGraph,
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
      creator: '@Kenbak',
    },
    robots: {
      index: shouldIndex,
      follow: shouldFollow,
      googleBot: {
        index: shouldIndex,
        follow: shouldFollow,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
  };
}

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
  status: 'confirmed' | 'pending' | 'stale' | 'unknown';
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

export type TxResolution =
  | { state: 'found'; meta: TxMeta }
  | { state: 'absent' }
  | { state: 'unavailable' };

export const getTxResolution = cache(async (txid: string): Promise<TxResolution> => {
  try {
    const res = await fetch(`${getApiUrl()}/api/tx/${txid}`, {
      next: { revalidate: 30 },
    });
    if (res.ok) {
      const data = await res.json();
      const indexedStatus: TxMeta['status'] = data.status === 'stale'
        ? 'stale'
        : data.status === 'unknown' || data.isCanonical === false
          ? 'unknown'
          : 'confirmed';
      const indexedMeta: TxMeta = {
        status: indexedStatus,
        txid: data.txid,
        blockHeight: parseInt(data.blockHeight) || 0,
        timestamp: parseInt(data.blockTime) || 0,
        confirmations: indexedStatus === 'confirmed' ? (parseInt(data.confirmations) || 0) : 0,
        isCoinbase: data.isCoinbase || false,
        hasShielded: data.hasSapling || data.hasOrchard || data.hasIronwood || data.hasShielded || false,
        orchardActions: data.orchardActions || 0,
        shieldedSpends: data.shieldedSpends || 0,
        shieldedOutputs: data.shieldedOutputs || 0,
        fee: data.fee || 0,
      };

      if (indexedStatus === 'confirmed') return { state: 'found', meta: indexedMeta };

      // A transaction removed by a reorg may return to the mempool. Prefer
      // that live state over the stale index record so it remains discoverable.
      const pendingResolution = await getPendingTxResolution(txid);
      return pendingResolution.state === 'found'
        ? pendingResolution
        : { state: 'found', meta: indexedMeta };
    }

    // A newly broadcast transaction may not be present in the confirmed
    // index yet. Check the mempool before treating the hash as absent.
    if (res.status !== 404) return { state: 'unavailable' };

    return getPendingTxResolution(txid);
  } catch {
    return { state: 'unavailable' };
  }
});

export const getTxMeta = cache(async (txid: string): Promise<TxMeta | null> => {
  const resolution = await getTxResolution(txid);
  return resolution.state === 'found' ? resolution.meta : null;
});

async function getPendingTxResolution(txid: string): Promise<TxResolution> {
  try {
    const mempoolRes = await fetch(`${getApiUrl()}/api/mempool/tx/${txid}`, {
      next: { revalidate: 10 },
    });
    if (!mempoolRes.ok) return { state: 'unavailable' };

    const mempoolData = await mempoolRes.json();
    if (!mempoolData.success) return { state: 'unavailable' };
    if (!mempoolData.inMempool) return { state: 'absent' };
    if (!mempoolData.transaction) {
      return { state: 'unavailable' };
    }

    const pending = mempoolData.transaction;
    return {
      state: 'found',
      meta: {
        status: 'pending',
        txid: pending.txid || txid,
        blockHeight: 0,
        timestamp: parseInt(pending.firstSeen) || 0,
        confirmations: 0,
        isCoinbase: false,
        hasShielded: pending.type === 'shielded' || pending.type === 'mixed' ||
          (pending.shieldedSpends || 0) > 0 ||
          (pending.shieldedOutputs || 0) > 0 ||
          (pending.orchardActions || 0) > 0 ||
          (pending.ironwoodActions || 0) > 0,
        orchardActions: pending.orchardActions || 0,
        shieldedSpends: pending.shieldedSpends || 0,
        shieldedOutputs: pending.shieldedOutputs || 0,
        fee: 0,
      },
    };
  } catch {
    return { state: 'unavailable' };
  }
}

// --- Address metadata ---

export interface AddressMeta {
  address: string;
  balance: number;
  type: 'shielded' | 'transparent' | 'unified';
  txCount: number;
  isShielded: boolean;
}

export type AddressResolution =
  | { state: 'found'; meta: AddressMeta }
  | { state: 'absent' }
  | { state: 'unavailable' };

export const getAddressResolution = cache(async (address: string): Promise<AddressResolution> => {
  try {
    const res = await fetch(`${getApiUrl()}/api/address/${address}?limit=1`, {
      next: { revalidate: 60 },
    });
    if (res.status === 404 || res.status === 410) return { state: 'absent' };
    if (!res.ok) return { state: 'unavailable' };
    const data = await res.json();

    const isShielded = data.type === 'shielded' || (data.note && (
      data.note.includes('Shielded address') ||
      data.note.includes('Fully shielded')
    ));

    return {
      state: 'found',
      meta: {
        address: data.address,
        balance: (data.balance || 0) / 100000000,
        type: data.type || 'transparent',
        txCount: data.txCount || data.transactionCount || 0,
        isShielded,
      },
    };
  } catch {
    return { state: 'unavailable' };
  }
});

export const getAddressMeta = cache(async (address: string): Promise<AddressMeta | null> => {
  const resolution = await getAddressResolution(address);
  return resolution.state === 'found' ? resolution.meta : null;
});

// --- Helpers ---

export function truncateHash(hash: string, start = 10, end = 6): string {
  if (hash.length <= start + end + 3) return hash;
  return `${hash.slice(0, start)}...${hash.slice(-end)}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}
