// Auto-detect network based on domain or env variable
function detectNetwork(): 'mainnet' | 'testnet' | 'crosslink' {
  // First check explicit env variable
  if (process.env.NEXT_PUBLIC_NETWORK === 'mainnet') return 'mainnet';
  if (process.env.NEXT_PUBLIC_NETWORK === 'crosslink-testnet' || process.env.NEXT_PUBLIC_NETWORK === 'crosslink') return 'crosslink';
  if (process.env.NEXT_PUBLIC_NETWORK === 'testnet') return 'testnet';

  // Auto-detect from domain (client-side only)
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname.includes('crosslink')) return 'crosslink';
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
export const isCrosslink = NETWORK === 'crosslink';

// Currency display
export const CURRENCY = isCrosslink ? 'CTAZ' : isMainnet ? 'ZEC' : 'TAZ';

// Network display
export const NETWORK_LABEL = isCrosslink ? 'CROSSLINK' : isMainnet ? 'MAINNET' : 'TESTNET';

// RPC config (server-side only)
export const RPC_CONFIG = {
  url: process.env.ZCASH_RPC_URL || (isMainnet ? 'http://localhost:8232' : 'http://localhost:18232'),
  cookie: process.env.ZCASH_RPC_COOKIE || '',
};

// Network colors
export const NETWORK_COLOR = isCrosslink ? 'text-cipher-purple' : isMainnet ? 'text-cipher-yellow' : 'text-gray-400';

// Domain URLs
export const MAINNET_URL = 'https://cipherscan.app';
export const TESTNET_URL = 'https://testnet.cipherscan.app';
export const CROSSLINK_URL = 'https://crosslink.cipherscan.app';

// Crosslink staking constants (from zebra-consensus)
export const STAKING_DAY_PERIOD = 150;
export const STAKING_DAY_WINDOW = 70;
export const STAKING_ACTION_DELAY_BLOCKS = 75;
