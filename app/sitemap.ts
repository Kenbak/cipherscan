import { MetadataRoute } from 'next';
import { headers } from 'next/headers';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const headersList = await headers();
  const host = headersList.get('host') || 'cipherscan.app';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;

  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${baseUrl}/network`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${baseUrl}/privacy`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/privacy-risks`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/decrypt`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/crosschain`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/mempool`, lastModified: now, changeFrequency: 'always', priority: 0.8 },
    { url: `${baseUrl}/learn`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/docs`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/tools`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/tools/unit-converter`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/tools/broadcast`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/tools/decode`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/tools/blend-check`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
  ];

  // Fetch recent blocks to give Google crawlable entry points
  let blockPages: MetadataRoute.Sitemap = [];
  try {
    const apiBase = host.includes('testnet')
      ? 'https://api.testnet.cipherscan.app'
      : 'https://api.mainnet.cipherscan.app';
    const res = await fetch(`${apiBase}/api/blocks?limit=50`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const data = await res.json();
      blockPages = (data.blocks || []).map((b: { height: string; timestamp: string }) => ({
        url: `${baseUrl}/block/${b.height}`,
        lastModified: new Date(parseInt(b.timestamp) * 1000),
        changeFrequency: 'monthly' as const,
        priority: 0.5,
      }));
    }
  } catch {
    // Non-critical — static pages still get indexed
  }

  return [...staticPages, ...blockPages];
}
