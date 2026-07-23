export const ISR_BUILD_FALLBACK_ENV = 'CIPHERSCAN_ALLOW_BUILD_UPSTREAM_FALLBACK';

export function isIsrBuildFallbackEnabled(): boolean {
  return process.env[ISR_BUILD_FALLBACK_ENV] === '1';
}

/**
 * Return an explicit build-only shell in offline CI. Everywhere else, surface
 * the upstream failure so Next keeps the last successful ISR entry instead of
 * replacing it with an empty or unknown render.
 */
export function retainLastGoodOrBuildFallback<T>(
  fallback: T,
  error: unknown,
  context: string,
): T {
  if (isIsrBuildFallbackEnabled()) return fallback;
  if (error instanceof Error) throw error;
  throw new Error(`${context} is unavailable`, { cause: error });
}
