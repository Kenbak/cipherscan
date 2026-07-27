import { MetadataRoute } from 'next';
import { getBaseUrl, getNetwork } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  const network = getNetwork();
  const baseUrl = getBaseUrl();

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

  // Testnet: allow crawling but throttle aggressively. Only the homepage is
  // indexed (page-level noindex on child routes), so crawlers gain nothing
  // from hammering dynamic block/tx/address pages.
  if (network === 'testnet') {
    return {
      rules: [
        {
          userAgent: 'Googlebot',
          allow: '/',
          disallow: ['/api/'],
          crawlDelay: 5,
        },
        {
          userAgent: 'Bingbot',
          allow: '/',
          disallow: ['/api/'],
          crawlDelay: 10,
        },
        {
          userAgent: '*',
          allow: '/',
          disallow: ['/api/'],
          crawlDelay: 10,
        },
      ],
      sitemap: `${baseUrl}/sitemap.xml`,
    };
  }

  // Mainnet: crawlable with moderate rate limits to keep serverless function
  // invocations under control.
  return {
    rules: [
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: ['/api/'],
        crawlDelay: 2,
      },
      {
        userAgent: 'Bingbot',
        allow: '/',
        disallow: ['/api/'],
        crawlDelay: 5,
      },
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/'],
        crawlDelay: 5,
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
