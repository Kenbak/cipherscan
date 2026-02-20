/**
 * API Configuration
 *
 * Determines which backend to use based on network:
 * - Mainnet: PostgreSQL API (fast, indexed) on api.mainnet.cipherscan.app
 * - Testnet: PostgreSQL API (fast, indexed) on api.testnet.cipherscan.app
 * - Crosslink Testnet: PostgreSQL API + crosslink finality enrichment
 *
 * Network is auto-detected from the domain:
 * - cipherscan.app → mainnet
 * - testnet.cipherscan.app → testnet
 * - crosslink.cipherscan.app → crosslink-testnet
 * - localhost → testnet (default)
 */

export type Network = 'mainnet' | 'testnet' | 'crosslink-testnet';

/**
 * Detect network from domain (client-side safe)
 */
function detectNetwork(): Network {
  // Server-side: check env var
  if (typeof window === 'undefined') {
    return (process.env.NEXT_PUBLIC_NETWORK as Network) || 'testnet';
  }

  // Client-side: detect from hostname
  const hostname = window.location.hostname;

  if (hostname === 'cipherscan.app' || hostname.includes('mainnet')) {
    return 'mainnet';
  }

  if (hostname.includes('crosslink')) {
    return 'crosslink-testnet';
  }

  return 'testnet';
}

export const NETWORK = detectNetwork();

const POSTGRES_API_URLS: Record<Network, string> = {
  'mainnet': 'https://api.mainnet.cipherscan.app',
  'testnet': 'https://api.testnet.cipherscan.app',
  'crosslink-testnet': process.env.NEXT_PUBLIC_CROSSLINK_API_URL || 'https://api.testnet.cipherscan.app',
};

export const API_CONFIG = {
  POSTGRES_API_URL: POSTGRES_API_URLS[NETWORK],

  // Direct RPC for fallback - server-side only
  RPC_URL: process.env.ZCASH_RPC_URL || 'http://localhost:18232',
  RPC_COOKIE: process.env.ZCASH_RPC_COOKIE,

  // Crosslink zebra-crosslink RPC (only set when running against a crosslink node)
  CROSSLINK_RPC_URL: process.env.CROSSLINK_RPC_URL || null,
  CROSSLINK_RPC_COOKIE: process.env.CROSSLINK_RPC_COOKIE || null,

  USE_POSTGRES_API: true,
};

/**
 * Get the appropriate API URL based on network (client-side safe)
 */
export function getApiUrl(): string {
  return API_CONFIG.USE_POSTGRES_API
    ? API_CONFIG.POSTGRES_API_URL
    : API_CONFIG.RPC_URL;
}

/**
 * Check if we should use PostgreSQL API (server-side for API routes)
 */
export function usePostgresApi(): boolean {
  return true;
}

/**
 * Check if we should use PostgreSQL API (client-side safe)
 */
export function usePostgresApiClient(): boolean {
  return true;
}

/**
 * Whether crosslink finality data is available (server-side only)
 */
export function hasCrosslinkRpc(): boolean {
  return !!API_CONFIG.CROSSLINK_RPC_URL;
}

/**
 * Whether this deployment targets a crosslink network (client-side safe)
 */
export function isCrosslinkNetwork(): boolean {
  return NETWORK === 'crosslink-testnet';
}
