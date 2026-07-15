interface RefreshEntry<Value> {
  expiresAt: number;
  hasValue: boolean;
  value?: Value;
  refresh?: Promise<Value>;
}

interface RefreshCacheOptions<Key, Value> {
  load: (key: Key) => Promise<Value>;
  maxAgeMs: number;
  retryAfterMs: number;
  fallback?: (key: Key, error: unknown) => Value;
  now?: () => number;
}

/**
 * Share one refresh per key, retain the last good value on refresh failure,
 * and back off before trying a failed refresh again.
 */
export function createRefreshCache<Key, Value>({
  load,
  maxAgeMs,
  retryAfterMs,
  fallback,
  now = Date.now,
}: RefreshCacheOptions<Key, Value>): (key: Key) => Promise<Value> {
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    throw new RangeError('maxAgeMs must be a positive finite number');
  }
  if (!Number.isFinite(retryAfterMs) || retryAfterMs <= 0) {
    throw new RangeError('retryAfterMs must be a positive finite number');
  }

  const entries = new Map<Key, RefreshEntry<Value>>();

  return async (key: Key): Promise<Value> => {
    let entry = entries.get(key);
    if (!entry) {
      entry = { expiresAt: 0, hasValue: false };
      entries.set(key, entry);
    }

    if (entry.hasValue && entry.expiresAt > now()) {
      return entry.value as Value;
    }
    if (entry.refresh) return entry.refresh;

    const refresh = load(key)
      .then((value) => {
        entry.value = value;
        entry.hasValue = true;
        entry.expiresAt = now() + maxAgeMs;
        return value;
      })
      .catch((error: unknown) => {
        if (entry.hasValue) {
          entry.expiresAt = now() + retryAfterMs;
          return entry.value as Value;
        }
        if (fallback) {
          const value = fallback(key, error);
          entry.value = value;
          entry.hasValue = true;
          entry.expiresAt = now() + retryAfterMs;
          return value;
        }
        throw error;
      })
      .finally(() => {
        if (entry.refresh === refresh) entry.refresh = undefined;
      });

    entry.refresh = refresh;
    return refresh;
  };
}
