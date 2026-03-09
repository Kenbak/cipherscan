import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  // Use mainnet as the canonical URL for robots/sitemap
  const isMainnet = process.env.NEXT_PUBLIC_NETWORK === 'mainnet';
  const baseUrl = isMainnet
    ? 'https://cipherscan.app'
    : 'https://testnet.cipherscan.app';

  if (!isMainnet) {
    return {
      rules: [
        {
          userAgent: '*',
          disallow: ['/'],
        },
      ],
    };
  }

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
