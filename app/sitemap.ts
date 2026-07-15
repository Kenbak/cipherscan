import { MetadataRoute } from 'next';
import type { Registration } from 'zcashname-sdk';
import { getAllNewsletters } from '@/lib/newsletter';
import { getApiUrl, getBaseUrl, getNetwork } from '@/lib/seo';
import { getClient, isValidName } from '@/lib/zns';

// Dynamic chain/name discovery must not be frozen to an empty build-time
// response when a public API is temporarily unreachable during deployment.
export const dynamic = 'force-dynamic';

type SitemapEntry = MetadataRoute.Sitemap[number];
type ChangeFrequency = NonNullable<SitemapEntry['changeFrequency']>;

interface StaticRoute {
  path: string;
  changeFrequency: ChangeFrequency;
  priority: number;
}

const MAINNET_ROUTES: StaticRoute[] = [
  { path: '/', changeFrequency: 'daily', priority: 1.0 },
  { path: '/blocks', changeFrequency: 'always', priority: 0.9 },
  { path: '/txs', changeFrequency: 'always', priority: 0.9 },
  { path: '/txs/shielded', changeFrequency: 'always', priority: 0.9 },
  { path: '/mempool', changeFrequency: 'always', priority: 0.9 },
  { path: '/network', changeFrequency: 'hourly', priority: 0.9 },
  { path: '/privacy', changeFrequency: 'daily', priority: 0.9 },
  { path: '/privacy-risks', changeFrequency: 'daily', priority: 0.8 },
  { path: '/pools', changeFrequency: 'daily', priority: 0.8 },
  { path: '/mining', changeFrequency: 'daily', priority: 0.8 },
  { path: '/charts', changeFrequency: 'daily', priority: 0.8 },
  { path: '/rich-list', changeFrequency: 'daily', priority: 0.8 },
  { path: '/reorgs', changeFrequency: 'hourly', priority: 0.8 },
  { path: '/crosschain', changeFrequency: 'daily', priority: 0.8 },
  { path: '/migration', changeFrequency: 'daily', priority: 0.8 },
  { path: '/turnstile', changeFrequency: 'hourly', priority: 0.8 },
  { path: '/usage-clock', changeFrequency: 'daily', priority: 0.7 },
  { path: '/zodl', changeFrequency: 'daily', priority: 0.7 },
  { path: '/learn', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/newsletter', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/decrypt', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/tools', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/tools/anchor-search', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/tools/blend-check', changeFrequency: 'daily', priority: 0.7 },
  { path: '/tools/broadcast', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/tools/decode', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/tools/unit-converter', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/docs', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/privacy-policy', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.2 },
];

// Keep the public testnet sitemap focused on network-specific tools and data.
// Other routes can be added once their visible copy and currency labels are
// explicitly localized to TAZ/testnet.
const TESTNET_ROUTES: StaticRoute[] = [
  { path: '/', changeFrequency: 'daily', priority: 1.0 },
  { path: '/blocks', changeFrequency: 'always', priority: 0.9 },
  { path: '/txs', changeFrequency: 'always', priority: 0.9 },
  { path: '/txs/shielded', changeFrequency: 'always', priority: 0.9 },
  { path: '/mempool', changeFrequency: 'always', priority: 0.9 },
  { path: '/network', changeFrequency: 'hourly', priority: 0.9 },
  { path: '/reorgs', changeFrequency: 'hourly', priority: 0.8 },
  { path: '/tools', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/tools/anchor-search', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/tools/broadcast', changeFrequency: 'monthly', priority: 0.7 },
];

function toDateFromSeconds(value: unknown): Date | undefined {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toNewsletterDate(value: string): Date | undefined {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

async function getRecentChainPages(baseUrl: string): Promise<MetadataRoute.Sitemap> {
  const apiUrl = getApiUrl();
  const [blocksResult, transactionsResult, orphanBlocksResult, addressesResult] = await Promise.allSettled([
    fetch(`${apiUrl}/api/blocks?limit=100`, { next: { revalidate: 300 } }),
    fetch(`${apiUrl}/api/transactions/list?limit=100&type=all`, { next: { revalidate: 300 } }),
    fetch(`${apiUrl}/api/uncles?limit=100`, { next: { revalidate: 300 } }),
    fetch(`${apiUrl}/api/rich-list?limit=100&offset=0`, { next: { revalidate: 3600 } }),
  ]);

  const entries: MetadataRoute.Sitemap = [];

  if (blocksResult.status === 'fulfilled' && blocksResult.value.ok) {
    try {
      const data = await blocksResult.value.json();
      for (const block of data.blocks || []) {
        const height = Number(block.height);
        if (!Number.isSafeInteger(height) || height < 0) continue;
        entries.push({
          url: `${baseUrl}/block/${height}`,
          lastModified: toDateFromSeconds(block.timestamp),
          changeFrequency: 'monthly',
          priority: 0.6,
        });
      }
    } catch {
      // Static and newsletter URLs remain useful if the chain API is degraded.
    }
  }

  if (transactionsResult.status === 'fulfilled' && transactionsResult.value.ok) {
    try {
      const data = await transactionsResult.value.json();
      for (const transaction of data.transactions || []) {
        if (typeof transaction.txid !== 'string' || !/^[a-fA-F0-9]{64}$/.test(transaction.txid)) continue;
        entries.push({
          url: `${baseUrl}/tx/${transaction.txid.toLowerCase()}`,
          lastModified: toDateFromSeconds(transaction.block_time ?? transaction.blockTime),
          changeFrequency: 'monthly',
          priority: 0.5,
        });
      }
    } catch {
      // Static and newsletter URLs remain useful if the chain API is degraded.
    }
  }

  if (orphanBlocksResult.status === 'fulfilled' && orphanBlocksResult.value.ok) {
    try {
      const data = await orphanBlocksResult.value.json();
      for (const block of data.orphanedBlocks || []) {
        if (typeof block.hash !== 'string' || !/^[a-fA-F0-9]{64}$/.test(block.hash)) continue;
        entries.push({
          url: `${baseUrl}/block/${block.hash.toLowerCase()}`,
          lastModified: toDate(block.detectedAt) ?? toDateFromSeconds(block.timestamp),
          changeFrequency: 'never',
          priority: 0.55,
        });
      }
    } catch {
      // Recent canonical chain URLs remain useful if reorg history is degraded.
    }
  }

  if (addressesResult.status === 'fulfilled' && addressesResult.value.ok) {
    try {
      const data = await addressesResult.value.json();
      for (const entry of data.addresses || []) {
        if (typeof entry.address !== 'string' || entry.address.length < 20) continue;
        entries.push({
          url: `${baseUrl}/address/${encodeURIComponent(entry.address)}`,
          lastModified: toDateFromSeconds(entry.lastSeen) ?? toDate(entry.lastSeen),
          changeFrequency: 'weekly',
          priority: 0.45,
        });
      }
    } catch {
      // Chain entity discovery remains useful if the rich-list API is degraded.
    }
  }

  return entries;
}

async function getRegisteredNamePages(baseUrl: string): Promise<MetadataRoute.Sitemap> {
  try {
    const client = getClient();
    const status = await client.status();
    const pageSize = 500;
    // Keep one sitemap response bounded even if the registry eventually grows
    // beyond today's size. It can be sharded when registrations exceed this.
    const total = Math.min(Math.max(Number(status.registered) || 0, 0), 5000);
    const registrations: Registration[] = [];

    for (let offset = 0; offset < total; offset += pageSize) {
      const page = await client.listAllRegistrations(pageSize, offset);
      registrations.push(...page);
      if (page.length < pageSize) break;
    }

    return registrations
      .filter((registration) => typeof registration.name === 'string' && isValidName(registration.name))
      .map((registration) => ({
        url: `${baseUrl}/name/${encodeURIComponent(registration.name.toLowerCase())}`,
        changeFrequency: 'weekly' as const,
        priority: 0.45,
      }));
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const network = getNetwork();

  // Do not advertise URLs from the blocked Crosslink deployment.
  if (network === 'crosslink-testnet') return [];

  const baseUrl = getBaseUrl();
  const routeConfig = network === 'mainnet' ? MAINNET_ROUTES : TESTNET_ROUTES;
  const newsletters = network === 'mainnet' ? getAllNewsletters() : [];
  const latestNewsletterDate = newsletters[0]
    ? toNewsletterDate(newsletters[0].date)
    : undefined;

  const staticPages: MetadataRoute.Sitemap = routeConfig.map((route) => ({
    url: route.path === '/' ? `${baseUrl}/` : `${baseUrl}${route.path}`,
    ...(route.path === '/newsletter' && latestNewsletterDate
      ? { lastModified: latestNewsletterDate }
      : {}),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const newsletterPages: MetadataRoute.Sitemap = newsletters.map((issue) => ({
    url: `${baseUrl}/newsletter/${encodeURIComponent(issue.slug)}`,
    lastModified: toNewsletterDate(issue.date),
    changeFrequency: 'never',
    priority: 0.6,
  }));

  const [recentChainPages, registeredNamePages] = await Promise.all([
    getRecentChainPages(baseUrl),
    network === 'mainnet' ? getRegisteredNamePages(baseUrl) : Promise.resolve([]),
  ]);
  const allPages = [
    ...staticPages,
    ...newsletterPages,
    ...recentChainPages,
    ...registeredNamePages,
  ];

  // Guard against an API returning duplicate records.
  return Array.from(new Map(allPages.map((entry) => [entry.url, entry])).values());
}
