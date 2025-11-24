/**
 * API Configuration
 *
 * Determines which backend to use based on network:
 * - Testnet: PostgreSQL API (fast, indexed)
 * - Mainnet: Direct RPC (for now)
 */

// Client-side safe: uses NEXT_PUBLIC_ prefix
export const NETWORK = (typeof window !== 'undefined'
  ? (window as any).__NEXT_DATA__?.props?.pageProps?.network
  : process.env.NEXT_PUBLIC_NETWORK) || 'testnet' as 'mainnet' | 'testnet';

export const API_CONFIG = {
  // PostgreSQL API URL (auto-detect based on network)
  POSTGRES_API_URL: process.env.NEXT_PUBLIC_POSTGRES_API_URL ||
    (NETWORK === 'mainnet' ? 'https://api.mainnet.cipherscan.app' : 'https://api.testnet.cipherscan.app'),

  // Direct RPC for fallback - server-side only
  RPC_URL: process.env.ZCASH_RPC_URL || 'http://localhost:18232',
  RPC_COOKIE: process.env.ZCASH_RPC_COOKIE,

  // Use PostgreSQL API for both mainnet and testnet
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
  return true; // Always use PostgreSQL API for both mainnet and testnet
}

/**
 * Check if we should use PostgreSQL API (client-side safe)
 */
export function usePostgresApiClient(): boolean {
  return true; // Always use PostgreSQL API for both mainnet and testnet
}
