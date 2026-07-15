import { MetadataRoute } from 'next';
import { getBaseUrl, getNetwork } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  const network = getNetwork();
  const baseUrl = getBaseUrl();

  // Crosslink remains private to search engines until its indexation policy is
  // explicitly opened. Root page metadata also emits noindex as a safeguard.
  if (network === 'crosslink-testnet') {
    return {
      rules: [
        {
          userAgent: '*',
          disallow: ['/'],
        },
      ],
    };
  }

  // Both mainnet and the public Zcash testnet are crawlable. Testnet child
  // pages deliberately remain crawlable so engines can observe their
  // page-level noindex; only the testnet homepage appears in its sitemap.
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
