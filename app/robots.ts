import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://testnet.cipherscan.app';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/'], // Don't crawl API endpoints
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

