'use client';

import { useState, useEffect, useRef } from 'react';
import { getApiUrl } from '@/lib/api-config';

interface UseApiQueryOptions {
  /** Set to false to skip the fetch (e.g. dependent on another value) */
  enabled?: boolean;
  /** Poll interval in ms — omit for one-shot fetches */
  refreshInterval?: number;
}

interface UseApiQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Shared data-fetching hook for CipherScan API endpoints.
 *
 * Builds the URL from `path` and optional `params`, fetches via getApiUrl(),
 * and manages loading/error/data state. Replaces the ~58 copies of the same
 * fetch/useEffect/useState pattern across the codebase.
 *
 * @param path  API path (e.g. "/api/network/stats")
 * @param params  Optional query params — undefined values are omitted
 * @param options  enabled (default true), refreshInterval (optional polling)
 */
export function useApiQuery<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
  options?: UseApiQueryOptions,
): UseApiQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const enabled = options?.enabled ?? true;
  const refreshInterval = options?.refreshInterval;

  // Stable serialisation of params for the dep array
  const paramKey = params ? JSON.stringify(params) : '';

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function doFetch() {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const url = new URL(`${getApiUrl()}${path}`);
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            if (v !== undefined) url.searchParams.set(k, String(v));
          }
        }

        const res = await fetch(url.toString(), { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err: unknown) {
        if (!cancelled && (err as Error).name !== 'AbortError') {
          setError((err as Error).message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    doFetch();

    let intervalId: ReturnType<typeof setInterval> | undefined;
    if (refreshInterval && refreshInterval > 0) {
      intervalId = setInterval(doFetch, refreshInterval);
    }

    return () => {
      cancelled = true;
      abortRef.current?.abort();
      if (intervalId) clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, paramKey, enabled, refreshInterval]);

  return { data, loading, error };
}
