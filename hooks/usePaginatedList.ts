'use client';

import { readApiCollection } from '@/lib/api-client';
import { useState, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import { fetchLiveResponse, startLiveRefresh } from '@/lib/live-refresh';
import { getApiUrl } from '@/lib/api-config';
import { useWebSocket } from '@/hooks/useWebSocket';

export interface BasePaginationState {
  page?: number;
  totalPages: number;
  total: number;
  hasNext: boolean;
  hasPrev: boolean;
  nextCursor: string | null;
  prevCursor: string | null;
  [key: string]: unknown;
}

export interface FetchPageArgs {
  cursor?: string | null;
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
  /** Return a comparable key for the newest item (silent refresh dedup) */
  getLatestKey: (item: T) => string | number;
  /** Build archive navigation href */
  buildArchiveHref: (
    cursor: string | null,
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
  initialCursor?: string | null;
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
  lastCheckedAt: number | null;
  refreshFailed: boolean;
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

  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
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
        limit: String(pageSize),
        ...(buildParams?.() ?? {}),
      });
      if (cursor !== undefined && cursor !== null) {
        params.set('cursor', String(cursor));
      }

      const { items: visibleItems, page: apiPage } = await fetchLiveResponse(`${base}${endpoint}?${params}`, readApiCollection<T>);
      const total = apiPage.total ?? 0;
      setItems(visibleItems);
      setPage(targetPage);
      setPagination({ ...apiPage, page: targetPage, total, totalPages: Math.ceil(total / pageSize) } as unknown as P);
      if (processExtra) setExtra(processExtra(visibleItems, visibleItems, direction));
      if (visibleItems[0]) latestKeyRef.current = getLatestKey(visibleItems[0]);
      setDataAvailable(true);
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
        limit: String(pageSize),
        ...(buildParams?.() ?? {}),
      });
      const { items: visibleItems, page: apiPage } = await fetchLiveResponse(`${base}${endpoint}?${params}`, readApiCollection<T>);
      setLastCheckedAt(Date.now());
      setRefreshFailed(false);
      setDataAvailable(true);
      const topKey = visibleItems[0] ? getLatestKey(visibleItems[0]) : '';
      if (topKey === latestKeyRef.current) {
        return;
      }
      latestKeyRef.current = topKey;
      const total = apiPage.total ?? 0;
      setItems(visibleItems);
      setPage(1);
      setPagination({ ...apiPage, page: 1, total, totalPages: Math.ceil(total / pageSize) } as unknown as P);
      if (processExtra) setExtra(processExtra(visibleItems, visibleItems));
      setDataAvailable(true);
    } catch {
      setRefreshFailed(true);
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

  useWebSocket(isFirstPage ? {
    onMessage: handleWsMessage,
    onConnect: () => { void silentRefreshRef.current(); },
  } : {});

  useEffect(() => {
    if (!isFirstPage || page !== 1 || !enabled) return;
    return startLiveRefresh(() => silentRefreshRef.current());
  }, [isFirstPage, page, enabled]);

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
    lastCheckedAt,
    refreshFailed,
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
