'use client';

import { useState, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import { getApiUrl } from '@/lib/api-config';
import { useWebSocket } from '@/hooks/useWebSocket';

export interface BasePaginationState {
  page?: number;
  totalPages: number;
  total: number;
  hasNext: boolean;
  hasPrev: boolean;
  nextCursor: number | null;
  prevCursor: number | null;
  [key: string]: unknown;
}

export interface FetchPageArgs {
  cursor?: number | null;
  secondaryCursor?: number | null;
  direction?: 'next' | 'prev';
  targetPage?: number;
}

export interface UsePaginatedListOptions<
  T,
  P extends BasePaginationState = BasePaginationState,
  E = unknown,
> {
  endpoint: string;
  pageSize: number;
  archiveBasePath: string;
  /** Query param name for the secondary cursor (e.g. cursor_idx, cursor_id) */
  secondaryCursorParam?: string;
  /** Pagination keys for secondary cursors used in prev/next hrefs */
  secondaryCursorFields?: { next: string; prev: string };
  /** Build filter/query params — cursor pagination params are added by the hook */
  buildParams?: () => Record<string, string>;
  /** Extract the raw item array from a successful API response */
  getItemsFromResponse: (json: Record<string, unknown>) => T[];
  /** Build cursor fields and any extra pagination metadata from visible items */
  buildCursors: (
    visibleItems: T[],
    ctx: { allItems: T[]; direction?: 'next' | 'prev'; targetPage: number },
  ) => Partial<P>;
  /** Return a comparable key for the newest item (silent refresh dedup) */
  getLatestKey: (item: T) => string | number;
  /** Build archive navigation href */
  buildArchiveHref: (
    cursor: number | null,
    secondaryCursor: number | null,
    direction: 'next' | 'prev',
    targetPage: number,
  ) => string;
  /** Optional extra state derived from the full fetched batch (e.g. trailing block) */
  processExtra?: (
    allItems: T[],
    visibleItems: T[],
    direction?: 'next' | 'prev',
  ) => E | undefined;
  /** Optional WS refresh gate — default refreshes on new_block/chain_tip */
  shouldWsRefresh?: (
    msg: Record<string, unknown>,
    latestKey: string | number,
  ) => boolean;
  initialItems?: T[];
  initialPagination?: Partial<P> | null;
  initialPage?: number;
  initialCursor?: number | null;
  initialSecondaryCursor?: number | null;
  initialDirection?: 'next' | 'prev';
  initialUnavailable?: boolean;
  initialExtra?: E;
  enabled?: boolean;
}

export interface UsePaginatedListResult<
  T,
  P extends BasePaginationState = BasePaginationState,
  E = unknown,
> {
  items: T[];
  page: number;
  pagination: P;
  loading: boolean;
  /** True while a background (silent/poll-driven) refresh is in flight.
   * Distinct from `loading`, which is reserved for explicit page loads —
   * `items`/`pagination` are retained on screen during a silent refresh. */
  isRefreshing: boolean;
  dataAvailable: boolean;
  extra: E | undefined;
  isFirstPage: boolean;
  firstHref: string;
  prevHref: string;
  nextHref: string;
  fetchPage: (args?: FetchPageArgs) => Promise<void>;
  setPage: (page: number) => void;
  setItems: Dispatch<SetStateAction<T[]>>;
  setPagination: Dispatch<SetStateAction<P>>;
  setExtra: Dispatch<SetStateAction<E | undefined>>;
}

function defaultPagination<P extends BasePaginationState>(page: number): P {
  return {
    page,
    totalPages: 0,
    total: 0,
    hasNext: false,
    hasPrev: false,
    nextCursor: null,
    prevCursor: null,
  } as P;
}

function defaultShouldWsRefresh(
  msg: Record<string, unknown>,
  _latestKey: string | number,
): boolean {
  return msg.type === 'new_block' || msg.type === 'chain_tip';
}

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

/** fetch() with a request timeout — a hung list/silent-refresh request
 * should never block the next poll tick indefinitely. */
async function fetchWithTimeout(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export function usePaginatedList<
  T,
  P extends BasePaginationState = BasePaginationState,
  E = unknown,
>(options: UsePaginatedListOptions<T, P, E>): UsePaginatedListResult<T, P, E> {
  const {
    endpoint,
    pageSize,
    secondaryCursorParam,
    secondaryCursorFields,
    buildParams,
    getItemsFromResponse,
    buildCursors,
    getLatestKey,
    buildArchiveHref,
    processExtra,
    shouldWsRefresh = defaultShouldWsRefresh,
    initialItems = [],
    initialPagination = null,
    initialPage = 1,
    initialCursor = null,
    initialSecondaryCursor = null,
    initialDirection = 'next',
    initialUnavailable = false,
    initialExtra,
    enabled = true,
  } = options;

  const isFirstPage = initialCursor === null;
  const hasInitialData = initialPagination !== null || initialItems.length > 0;
  const fallbackStarted = useRef(false);
  const latestKeyRef = useRef<string | number>(
    initialItems[0] ? getLatestKey(initialItems[0]) : '',
  );
  const silentRefreshRef = useRef<() => Promise<void>>(async () => {});

  const [items, setItems] = useState<T[]>(initialItems);
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(!hasInitialData);
  const [dataAvailable, setDataAvailable] = useState(!initialUnavailable);
  const [extra, setExtra] = useState<E | undefined>(initialExtra);
  const [pagination, setPagination] = useState<P>(() => {
    if (!initialPagination) return defaultPagination<P>(initialPage);
    return { ...defaultPagination<P>(initialPage), ...initialPagination } as P;
  });

  const fetchPage = useCallback(async (args: FetchPageArgs = {}) => {
    if (!enabled) return;

    const {
      cursor,
      secondaryCursor,
      direction,
      targetPage = 1,
    } = args;

    setLoading(true);
    try {
      const base = getApiUrl();
      const params = new URLSearchParams({
        limit: String(pageSize + 1),
        ...(buildParams?.() ?? {}),
      });
      if (cursor !== undefined && cursor !== null) {
        params.set('cursor', String(cursor));
        params.set('direction', direction || 'next');
        if (secondaryCursorParam) {
          params.set(secondaryCursorParam, String(secondaryCursor ?? 0));
        }
      }

      const res = await fetchWithTimeout(`${base}${endpoint}?${params}`);
      if (!res.ok) throw new Error(`${endpoint} returned ${res.status}`);
      const json = await res.json();

      if (json.success) {
        const all = getItemsFromResponse(json);
        const reverseOffset = direction === 'prev' && all.length > pageSize ? 1 : 0;
        const visibleItems = all.slice(reverseOffset, reverseOffset + pageSize);
        const total = Number(json.pagination?.total) || 0;
        const cursorFields = buildCursors(visibleItems, {
          allItems: all,
          direction,
          targetPage,
        });

        setItems(visibleItems);
        setPage(targetPage);
        setPagination({
          ...json.pagination,
          ...cursorFields,
          page: targetPage,
          total,
          totalPages: Math.ceil(total / pageSize),
          hasNext: direction === 'prev'
            ? cursor !== null && cursor !== undefined && visibleItems.length > 0
            : all.length > pageSize,
          hasPrev: targetPage > 1,
        } as P);

        if (processExtra) {
          setExtra(processExtra(all, visibleItems, direction));
        }

        if (visibleItems[0]) {
          latestKeyRef.current = getLatestKey(visibleItems[0]);
        }
        setDataAvailable(true);
      } else {
        setDataAvailable(false);
      }
    } catch (err) {
      console.error(`Error fetching ${endpoint}:`, err);
      setDataAvailable(false);
    } finally {
      setLoading(false);
    }
  }, [
    enabled,
    pageSize,
    buildParams,
    endpoint,
    getItemsFromResponse,
    buildCursors,
    getLatestKey,
    processExtra,
    secondaryCursorParam,
  ]);

  useEffect(() => {
    if (!enabled || hasInitialData || fallbackStarted.current) return;
    fallbackStarted.current = true;
    fetchPage({
      cursor: initialCursor,
      secondaryCursor: initialSecondaryCursor,
      direction: initialDirection,
      targetPage: initialPage,
    });
    // Initial request inputs are fixed for this keyed client instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshInFlightRef = useRef(false);
  const refreshFailureCountRef = useRef(0);

  const silentRefresh = useCallback(async () => {
    if (!isFirstPage || page !== 1 || !enabled) return;
    // Guard against overlap: a slow refresh plus a WS-triggered refresh
    // (or a poll tick landing mid-request) should never fire concurrently.
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    setIsRefreshing(true);
    try {
      const base = getApiUrl();
      const params = new URLSearchParams({
        limit: String(pageSize + 1),
        ...(buildParams?.() ?? {}),
      });
      const res = await fetchWithTimeout(`${base}${endpoint}?${params}`);
      if (!res.ok) throw new Error(`${endpoint} returned ${res.status}`);
      const json = await res.json();
      const all = getItemsFromResponse(json);
      if (!json.success || all.length === 0) {
        refreshFailureCountRef.current = 0;
        return;
      }

      const topKey = getLatestKey(all[0]);
      if (topKey === latestKeyRef.current) {
        refreshFailureCountRef.current = 0;
        return;
      }
      latestKeyRef.current = topKey;

      const visibleItems = all.slice(0, pageSize);
      const total = Number(json.pagination?.total) || 0;
      const cursorFields = buildCursors(visibleItems, {
        allItems: all,
        targetPage: 1,
      });

      setItems(visibleItems);
      setPage(1);
      setPagination(prev => ({
        ...prev,
        ...cursorFields,
        page: 1,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasNext: all.length > pageSize,
        hasPrev: false,
      } as P));

      if (processExtra) {
        setExtra(processExtra(all, visibleItems));
      }
      setDataAvailable(true);
      refreshFailureCountRef.current = 0;
    } catch {
      // Silent by design (background refresh) — but tracked so the poll
      // loop below can back off instead of hammering a struggling endpoint.
      refreshFailureCountRef.current += 1;
    } finally {
      refreshInFlightRef.current = false;
      setIsRefreshing(false);
    }
  }, [
    isFirstPage,
    page,
    enabled,
    pageSize,
    buildParams,
    endpoint,
    getItemsFromResponse,
    buildCursors,
    getLatestKey,
    processExtra,
  ]);

  silentRefreshRef.current = silentRefresh;

  const handleWsMessage = useCallback((msg: Record<string, unknown>) => {
    if (!isFirstPage || page !== 1) return;
    if (shouldWsRefresh(msg, latestKeyRef.current)) {
      silentRefreshRef.current();
    }
  }, [isFirstPage, page, shouldWsRefresh]);

  const { isConnected: wsConnected } = useWebSocket(
    isFirstPage ? { onMessage: handleWsMessage } : {},
  );

  // Self-rescheduling timeout chain (rather than setInterval) so the delay
  // can back off on repeated failures and pause entirely while the tab is
  // hidden — a backgrounded tab polling a list nobody can see wastes both
  // battery and API quota. Resumes (with an immediate refresh if stale)
  // the moment the tab becomes visible again.
  useEffect(() => {
    if (!isFirstPage || page !== 1) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const baseDelay = wsConnected ? 60000 : 15000;

    const scheduleNext = () => {
      if (cancelled || typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const delay = refreshFailureCountRef.current > 0
        ? Math.min(baseDelay * 2 ** refreshFailureCountRef.current, MAX_BACKOFF_MS)
        : baseDelay;
      timer = setTimeout(async () => {
        await silentRefreshRef.current();
        scheduleNext();
      }, delay);
    };

    scheduleNext();

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') {
        if (timer) clearTimeout(timer);
        timer = null;
        return;
      }
      if (!timer) {
        silentRefreshRef.current().finally(scheduleNext);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isFirstPage, page, wsConnected]);

  const pagRecord = pagination as Record<string, unknown>;
  const nextSecondaryCursor = secondaryCursorFields
    ? (pagRecord[secondaryCursorFields.next] as number | null) ?? null
    : null;
  const prevSecondaryCursor = secondaryCursorFields
    ? (pagRecord[secondaryCursorFields.prev] as number | null) ?? null
    : null;

  const firstHref = buildArchiveHref(null, null, 'next', 1);
  const prevHref = page <= 2
    ? firstHref
    : buildArchiveHref(pagination.prevCursor, prevSecondaryCursor, 'prev', page - 1);
  const nextHref = buildArchiveHref(
    pagination.nextCursor,
    nextSecondaryCursor,
    'next',
    page + 1,
  );

  return {
    items,
    page,
    pagination,
    loading,
    isRefreshing,
    dataAvailable,
    extra,
    isFirstPage,
    firstHref,
    prevHref,
    nextHref,
    fetchPage,
    setPage,
    setItems,
    setPagination,
    setExtra,
  };
}
