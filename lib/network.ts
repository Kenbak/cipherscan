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

/**
 * Public API helpers append their own `/api/...` paths. Accept the legacy
 * Crosslink setting that ended in `/api`, but normalize every configured base
 * to an origin-style URL so callers cannot accidentally request `/api/api/...`.
 */
export function normalizeApiBaseUrl(value: string): string {
  const withoutTrailingSlashes = value.trim().replace(/\/+$/, '');
  return withoutTrailingSlashes.replace(/\/api$/i, '');
}
