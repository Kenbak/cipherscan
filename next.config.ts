import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: process.cwd(),
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/blocks',
          destination: '/blocks/latest',
          missing: ['cursor', 'direction', 'page', 'software', 'pool', 'order', 'from', 'to', 'min_height', 'max_height', 'min_interval', 'max_interval', 'min_size', 'max_size', 'min_fees', 'max_fees', 'min_txs', 'max_txs'].map((key) => ({
            type: 'query' as const,
            key,
          })),
        },
        {
          source: '/txs',
          destination: '/txs/latest',
          missing: ['cursor', 'cursor_idx', 'cursor_id', 'direction', 'page', 'type', 'flow_type', 'pool', 'min_zec'].map((key) => ({
            type: 'query' as const,
            key,
          })),
        },
      ],
      afterFiles: [
        {
          source: '/sitemap-:slug.xml',
          destination: '/sitemaps/:slug',
        },
      ],
      fallback: [],
    };
  },
  async redirects() {
    return [
      // Mainnet brand migration only; testnet and Crosslink keep their own identity.
      {
        source: '/:path*',
        has: [{ type: 'host', value: '(?:www\\.)?cipherscan\\.app' }],
        destination: 'https://zecblock.com/:path*',
        permanent: true,
      },
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www\\.zecblock\\.com' }],
        destination: 'https://zecblock.com/:path*',
        permanent: true,
      },
      {
        source: '/migration',
        destination: '/ironwood',
        permanent: true,
      },
      {
        source: '/swap',
        destination: 'https://cipherswap.app/',
        permanent: true,
      },
      {
        source: '/flows',
        destination: '/crosschain',
        permanent: true,
      },
      {
        source: '/tools/privacy-check',
        destination: '/tools/blend-check',
        permanent: true,
      },
      {
        source: '/privacy-stats',
        destination: '/privacy',
        permanent: true,
      },
      {
        source: '/privacy/risks',
        destination: '/privacy-risks',
        permanent: true,
      },
      {
        source: '/blend-check',
        destination: '/tools/blend-check',
        permanent: true,
      },
    ];
  },
  webpack: (config, { isServer }) => {
    // Add WASM support
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    // Handle .wasm files
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'webassembly/async',
    });

    // Ignore .wasm files in node_modules for client-side
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }

    return config;
  },
};

export default nextConfig;
