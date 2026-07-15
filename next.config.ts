import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  async redirects() {
    return [
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
