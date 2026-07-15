export type AppNetwork = 'mainnet' | 'testnet' | 'crosslink-testnet';

/**
 * Normalize the build-time network selector in one place so metadata, API
 * routing, and visible network labels cannot disagree.
 */
export function getConfiguredNetwork(): AppNetwork | undefined {
  const configured = process.env.NEXT_PUBLIC_NETWORK;

  if (configured === 'mainnet' || configured === 'testnet') {
    return configured;
  }

  // `crosslink` is a legacy deployment value. New configuration should use
  // the explicit `crosslink-testnet` name documented in DEPLOYMENT.md.
  if (configured === 'crosslink' || configured === 'crosslink-testnet') {
    return 'crosslink-testnet';
  }

  return undefined;
}
