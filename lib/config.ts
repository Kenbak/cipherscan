// Auto-detect network based on domain or env variable
function detectNetwork(): 'mainnet' | 'testnet' {
  // First check explicit env variable
  if (process.env.NEXT_PUBLIC_NETWORK === 'mainnet') return 'mainnet';
  if (process.env.NEXT_PUBLIC_NETWORK === 'testnet') return 'testnet';

  // Auto-detect from domain (client-side only)
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname.includes('testnet.')) return 'testnet';
    if (hostname === 'cipherscan.app' || hostname === 'www.cipherscan.app') return 'mainnet';
  }

  // Default to testnet for local dev
  return 'testnet';
}

// Network configuration
export const NETWORK = detectNetwork();

export const isMainnet = NETWORK === 'mainnet';
export const isTestnet = NETWORK === 'testnet';

// Currency display
export const CURRENCY = isMainnet ? 'ZEC' : 'TAZ';

// Network display
export const NETWORK_LABEL = isMainnet ? 'MAINNET' : 'TESTNET';

// RPC config (server-side only)
export const RPC_CONFIG = {
  url: process.env.ZCASH_RPC_URL || (isMainnet ? 'http://localhost:8232' : 'http://localhost:18232'),
  cookie: process.env.ZCASH_RPC_COOKIE || '',
};

// Network colors
export const NETWORK_COLOR = isMainnet ? 'text-cipher-green' : 'text-gray-400';

// Domain URLs
export const MAINNET_URL = 'https://cipherscan.app';
export const TESTNET_URL = 'https://testnet.cipherscan.app';
