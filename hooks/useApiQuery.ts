'use client';

import { useEffect, useRef, useState } from 'react';
import { getApiUrl } from '@/lib/api-config';

interface UseApiQueryOptions {
  /** Set to false to skip the fetch (e.g. dependent on another value) */
  enabled?: boolean;
  /** Poll interval in ms — omit for one-shot fetches */
  refreshInterval?: number;
  /**
   * Abort and treat as an error if the request takes longer than this.
   * Defaults to 15s — long enough for slow analytics endpoints, short
   * enough that a hung request doesn't block a background poll forever.
   */
  timeoutMs?: number;
  /**
   * Pause polling while the tab is hidden, and immediately refresh (once)
   * when it becomes visible again if a poll was skipped. Defaults to true —
   * there's rarely a reason to keep polling a backgrounded tab.
   */
  pauseWhenHidden?: boolean;
}

interface UseApiQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /**
   * True while a background refresh (poll tick, or a query-key change with
   * stale data already on screen) is in flight. `loading` stays false in
   * that case so consumers don't need to special-case it to avoid flashing
   * a skeleton over content that's already rendered — the old data stays
   * put via stale-data retention until the refresh resolves.
   */
  isRefreshing: boolean;
}

interface QueryState {
  data: unknown;
  error: string | null;
  /** True once at least one fetch for this key has completed (success or error). */
  settled: boolean;
  fetching: boolean;
  fetchedAt: number;
}

type Listener = (state: QueryState) => void;

interface RegistryEntry {
  key: string;
  url: string;
  refreshInterval?: number;
  timeoutMs: number;
  subscribers: Set<Listener>;
  state: QueryState;
  inFlight: boolean;
  controller: AbortController | null;
  timer: ReturnType<typeof setTimeout> | null;
  failureCount: number;
  teardownTimer: ReturnType<typeof setTimeout> | null;
}

// Module-level so every `useApiQuery` instance across the app shares it.
// This is what makes two components polling the exact same URL on the same
// interval (e.g. IronwoodBanner + IronwoodProgressCard both hitting
// `/api/migration/overview` every 30s) collapse into a single in-flight
// request and a single timer instead of firing independently.
const registry = new Map<string, RegistryEntry>();

const MAX_BACKOFF_MS = 5 * 60 * 1000;

function isHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

function notify(entry: RegistryEntry) {
  entry.subscribers.forEach((listener) => {
    try {
      listener(entry.state);
    } catch (err) {
      console.error('[useApiQuery] listener threw:', err);
    }
  });
}

async function runFetch(entry: RegistryEntry) {
  if (entry.inFlight) return;
  entry.inFlight = true;
  entry.state = { ...entry.state, fetching: true };
  notify(entry);
  entry.controller?.abort();
  const controller = new AbortController();
  entry.controller = controller;
  const timeoutId = setTimeout(() => controller.abort(), entry.timeoutMs);

  try {
    const res = await fetch(entry.url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    entry.failureCount = 0;
    entry.state = { data: json, error: null, settled: true, fetching: false, fetchedAt: Date.now() };
    notify(entry);
  } catch (err: unknown) {
    if ((err as Error)?.name === 'AbortError' && entry.controller !== controller) {
      // Superseded by a newer request for this same key — ignore.
      return;
    }
    entry.failureCount += 1;
    const message = (err as Error)?.name === 'AbortError'
      ? 'Request timed out'
      : (err as Error)?.message || 'Request failed';
    entry.state = {
      ...entry.state,
      error: message,
      settled: true,
      fetching: false,
      fetchedAt: Date.now(),
    };
    notify(entry);
  } finally {
    clearTimeout(timeoutId);
    entry.inFlight = false;
    if (entry.controller === controller) entry.controller = null;
    scheduleNext(entry);
  }
}

function scheduleNext(entry: RegistryEntry) {
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
  if (!entry.refreshInterval || entry.subscribers.size === 0) return;
  if (isHidden()) return; // resumed by the global visibility listener below

  // Exponential backoff on repeated failures, capped, reset on success
  // (failureCount is zeroed in runFetch on a 2xx+parseable response).
  const delay = entry.failureCount > 0
    ? Math.min(entry.refreshInterval * 2 ** entry.failureCount, MAX_BACKOFF_MS)
    : entry.refreshInterval;

  entry.timer = setTimeout(() => runFetch(entry), delay);
}

function getOrCreateEntry(key: string, url: string, refreshInterval: number | undefined, timeoutMs: number): RegistryEntry {
  let entry = registry.get(key);
  if (entry) {
    if (entry.teardownTimer) {
      clearTimeout(entry.teardownTimer);
      entry.teardownTimer = null;
    }
    return entry;
  }
  entry = {
    key,
    url,
    refreshInterval,
    timeoutMs,
    subscribers: new Set(),
    state: { data: null, error: null, settled: false, fetching: false, fetchedAt: 0 },
    inFlight: false,
    controller: null,
    timer: null,
    failureCount: 0,
    teardownTimer: null,
  };
  registry.set(key, entry);
  return entry;
}

function releaseEntry(entry: RegistryEntry) {
  // Defer teardown by a tick — React 19 effect cleanup/re-run (StrictMode,
  // fast route transitions) can unsubscribe and immediately resubscribe the
  // same key; tearing down synchronously would throw away in-flight work
  // and cached data for no reason.
  if (entry.teardownTimer) clearTimeout(entry.teardownTimer);
  entry.teardownTimer = setTimeout(() => {
    if (entry.subscribers.size > 0) return;
    if (entry.timer) clearTimeout(entry.timer);
    entry.controller?.abort();
    registry.delete(entry.key);
  }, 0);
}

// Single global visibility listener (not one per entry) that pauses/resumes
// every active polling entry together.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      registry.forEach((entry) => {
        if (entry.timer) {
          clearTimeout(entry.timer);
          entry.timer = null;
        }
      });
      return;
    }
    registry.forEach((entry) => {
      if (!entry.refreshInterval || entry.subscribers.size === 0) return;
      const staleFor = Date.now() - entry.state.fetchedAt;
      if (!entry.state.settled || staleFor >= entry.refreshInterval) {
        runFetch(entry);
      } else {
        scheduleNext(entry);
      }
    });
  });
}

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(`${getApiUrl()}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

/**
 * Shared data-fetching hook for CipherScan API endpoints.
 *
 * Builds the URL from `path` and optional `params`, fetches via getApiUrl(),
 * and manages loading/error/data state. Replaces the ~58 copies of the same
 * fetch/useEffect/useState pattern across the codebase.
 *
 * Beyond the original one-shot/poll fetch, this also:
 * - Dedupes concurrent requests for the same URL + refresh interval across
 *   every mounted component (see the module-level `registry` above).
 * - Retains the last good `data` across both poll ticks and query-key
 *   changes instead of clearing it to `null` first — `isRefreshing`
 *   distinguishes "waiting for the very first response" (`loading`) from
 *   "already have data, quietly refreshing it".
 * - Applies a request timeout and exponential backoff on repeated failures.
 * - Pauses polling while the tab is hidden and refreshes once on return.
 *
 * @param path  API path (e.g. "/api/network/stats")
 * @param params  Optional query params — undefined values are omitted
 * @param options  enabled (default true), refreshInterval (optional polling),
 *   timeoutMs (default 15000), pauseWhenHidden (default true)
 */
export function useApiQuery<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
  options?: UseApiQueryOptions,
): UseApiQueryResult<T> {
  const enabled = options?.enabled ?? true;
  const refreshInterval = options?.refreshInterval;
  const timeoutMs = options?.timeoutMs ?? 15000;

  const paramKey = params ? JSON.stringify(params) : '';
  const url = buildUrl(path, params);
  const key = `${url}::${refreshInterval ?? 'once'}`;

  // Stale-data retention across query-key changes (e.g. a `period` filter
  // toggle): keep showing the last good payload for *this hook instance*
  // until the new key's fetch resolves, rather than flashing back to null.
  const lastGoodDataRef = useRef<T | null>(null);
  const hasEverLoadedRef = useRef(false);

  const [, forceRender] = useState(0);
  const stateRef = useRef<QueryState>({
    data: null,
    error: null,
    settled: false,
    fetching: false,
    fetchedAt: 0,
  });

  useEffect(() => {
    if (!enabled) return;

    const entry = getOrCreateEntry(key, url, refreshInterval, timeoutMs);
    // Keep entry config current in case a param-driven interval changes.
    entry.refreshInterval = refreshInterval;
    entry.timeoutMs = timeoutMs;

    const listener: Listener = (state) => {
      stateRef.current = state;
      forceRender((n) => n + 1);
    };
    entry.subscribers.add(listener);
    stateRef.current = entry.state;
    forceRender((n) => n + 1);

    const isFreshEntry = !entry.state.settled && !entry.inFlight;
    if (isFreshEntry) {
      runFetch(entry);
    } else if (entry.refreshInterval && !entry.timer && !entry.inFlight && !isHidden()) {
      // Entry existed (shared with another subscriber) but had no active
      // timer (e.g. it was momentarily orphaned) — make sure polling resumes.
      scheduleNext(entry);
    }

    return () => {
      entry.subscribers.delete(listener);
      releaseEntry(entry);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  const state = stateRef.current;

  if (state.settled && state.error === null) {
    lastGoodDataRef.current = state.data as T;
    hasEverLoadedRef.current = true;
  }

  if (!enabled) {
    return { data: lastGoodDataRef.current, loading: false, error: null, isRefreshing: false };
  }

  const hasData = hasEverLoadedRef.current && lastGoodDataRef.current !== null;
  // Only the very first fetch (nothing to show yet) counts as `loading`.
  // A failed *first* fetch still resolves `loading` to false (settled),
  // surfacing `error` with `data: null`, same as the original hook.
  const loading = !hasData && (!state.settled || state.fetching);
  // Refreshing = we already have something on screen, and the in-flight
  // fetch for the current key hasn't resolved yet (poll tick, or a
  // query-key change while stale data from the previous key is retained).
  const isRefreshing = hasData && state.fetching;

  return {
    data: hasData ? lastGoodDataRef.current : (state.settled ? (state.data as T | null) : null),
    loading,
    error: state.error,
    isRefreshing,
  };
}

// Exposed for tests / advanced callers that need to force-clear shared
// poll state between test cases.
export function __resetApiQueryRegistryForTests() {
  registry.forEach((entry) => {
    if (entry.timer) clearTimeout(entry.timer);
    if (entry.teardownTimer) clearTimeout(entry.teardownTimer);
    entry.controller?.abort();
  });
  registry.clear();
}
