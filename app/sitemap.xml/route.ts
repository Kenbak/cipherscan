import { getBaseUrl, getNetwork } from '@/lib/seo';
import {
  getMainnetSitemapIndexEntries,
  serializeSitemapIndex,
  serializeUrlSet,
} from '@/lib/sitemaps';

export const dynamic = 'force-dynamic';

function xmlResponse(xml: string, maxAge: number): Response {
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}`,
      'CDN-Cache-Control': `public, s-maxage=${maxAge}`,
      'Vercel-CDN-Cache-Control': `public, s-maxage=${maxAge}`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function GET(): Response {
  const network = getNetwork();

  if (network === 'crosslink-testnet') {
    return xmlResponse(serializeUrlSet([]), 86_400);
  }

  const baseUrl = getBaseUrl();
  if (network === 'testnet') {
    return xmlResponse(serializeUrlSet([{ url: `${baseUrl}/` }]), 86_400);
  }

  return xmlResponse(
    serializeSitemapIndex(getMainnetSitemapIndexEntries(baseUrl)),
    300,
  );
}
