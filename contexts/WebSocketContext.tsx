'use client';

/**
 * App-level WebSocket provider.
 *
 * Owns exactly one browser WebSocket connection to the API's `/ws` endpoint
 * for the entire app, and fans messages out to every subscriber (components
 * previously each opened their own `new WebSocket(...)` via `useWebSocket`,
 * so a page like the homepage or `/mempool` could have 5-10 independent
 * sockets to the same server). Consumers keep using `hooks/useWebSocket.ts`,
 * which now subscribes to this context instead of owning a socket.
 *
 * Responsibilities:
 * - Fan-out: `subscribe(listener)` / `subscribeConnection(listener)` for
 *   message and connection-state fan-out to any number of components.
 * - Heartbeat: a lightweight periodic `{"type":"ping"}` frame keeps the
 *   connection alive through reverse-proxy idle timeouts (Caddy et al).
 *   The server does not need to understand or reply to it — this is a
 *   keep-alive, not an app-level liveness probe. We do NOT treat a missing
 *   reply as "dead" since there's no server-side pong contract to rely on
 *   without touching server/api files (out of scope for this change).
 * - Reconnect with exponential backoff + full jitter, capped, so a server
 *   restart or network blip doesn't cause a reconnect thundering herd
 *   across every open tab/component.
 * - Visibility handling: reconnect attempts pause while the tab is hidden
 *   (backgrounded tabs get throttled timers anyway) and resume immediately,
 *   with the attempt counter reset, when the tab becomes visible again —
 *   this handles OS sleep / laptop-lid-close / long tab-away periods.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getApiUrl } from '@/lib/api-config';

export interface WebSocketMessage {
  type: string;
  data: any;
}

type MessageListener = (message: WebSocketMessage) => void;
type ConnectionListener = (connected: boolean) => void;

interface WebSocketContextValue {
  isConnected: boolean;
  lastMessage: WebSocketMessage | null;
  subscribe: (listener: MessageListener) => () => void;
  subscribeConnection: (listener: ConnectionListener) => () => void;
  reconnectNow: () => void;
  close: () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

const BASE_RECONNECT_MS = 3000;
const MAX_RECONNECT_MS = 30000;
const HEARTBEAT_INTERVAL_MS = 25000;

function buildWsUrl(): string {
  const apiUrl = getApiUrl();
  return apiUrl.replace(/^http/, 'ws').replace(/\/api$/, '');
}

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptRef = useRef(0);
  const listenersRef = useRef<Set<MessageListener>>(new Set());
  const connectionListenersRef = useRef<Set<ConnectionListener>>(new Set());
  const mountedRef = useRef(true);
  const manualCloseRef = useRef(false);
  // Assigned by `connect()` before use; satisfies strict `noUnusedLocals`
  // style ordering (heartbeat/reconnect are declared before `connect` since
  // `connect` references both).
  const connectRef = useRef<() => void>(() => {});

  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(() => {
    clearHeartbeat();
    heartbeatIntervalRef.current = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send(JSON.stringify({ type: 'ping' }));
      } catch {
        // Send failing on a socket that reports OPEN means it's actually
        // dead — force a close so onclose drives the normal reconnect path.
        ws.close();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }, [clearHeartbeat]);

  const scheduleReconnect = useCallback(() => {
    if (manualCloseRef.current || !mountedRef.current) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      // Don't burn attempts/backoff while backgrounded — the visibilitychange
      // handler below reconnects immediately (with a reset attempt counter)
      // the moment the tab is foregrounded again.
      return;
    }
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    attemptRef.current += 1;
    const cappedBackoff = Math.min(
      BASE_RECONNECT_MS * 2 ** (attemptRef.current - 1),
      MAX_RECONNECT_MS,
    );
    // Full jitter within [base/2, cappedBackoff] — avoids a reconnect
    // thundering herd across every open tab after a server restart, while
    // never firing near-instantly on later attempts.
    const jittered = BASE_RECONNECT_MS / 2 + Math.random() * (cappedBackoff - BASE_RECONNECT_MS / 2);
    reconnectTimeoutRef.current = setTimeout(() => connectRef.current(), jittered);
  }, []);

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }
    manualCloseRef.current = false;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    try {
      const ws = new WebSocket(buildWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        attemptRef.current = 0;
        setIsConnected(true);
        connectionListenersRef.current.forEach((listener) => listener(true));
        startHeartbeat();
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          // Our own keep-alive frame type — never surfaced to subscribers.
          if (message.type === 'ping' || message.type === 'pong') return;
          if (!mountedRef.current) return;
          setLastMessage(message);
          listenersRef.current.forEach((listener) => {
            try {
              listener(message);
            } catch (err) {
              console.error('[WebSocket] listener threw:', err);
            }
          });
        } catch {
          // Silently ignore parse errors — matches prior per-component hook behavior.
        }
      };

      ws.onerror = () => {
        // No-op: onclose always follows and drives reconnect scheduling.
      };

      ws.onclose = () => {
        wsRef.current = null;
        clearHeartbeat();
        if (!mountedRef.current) return;
        setIsConnected(false);
        connectionListenersRef.current.forEach((listener) => listener(false));
        if (!manualCloseRef.current) scheduleReconnect();
      };
    } catch (error) {
      console.error('❌ [WebSocket] Connection failed:', error);
      scheduleReconnect();
    }
  }, [clearHeartbeat, scheduleReconnect, startHeartbeat]);

  connectRef.current = connect;

  const close = useCallback(() => {
    manualCloseRef.current = true;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    clearHeartbeat();
    wsRef.current?.close();
    wsRef.current = null;
  }, [clearHeartbeat]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      close();
    };
    // Intentionally run once — `connect`/`close` are stable via refs/useCallback
    // and re-running this on their identity would fight the reconnect timers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconnect immediately (and reset backoff) when the tab regains
  // visibility — handles OS sleep, tab discard, and long backgrounding,
  // where a dead socket may not have fired `onclose` yet.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      attemptRef.current = 0;
      if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [connect]);

  const subscribe = useCallback((listener: MessageListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const subscribeConnection = useCallback((listener: ConnectionListener) => {
    connectionListenersRef.current.add(listener);
    return () => {
      connectionListenersRef.current.delete(listener);
    };
  }, []);

  const value = useMemo<WebSocketContextValue>(
    () => ({
      isConnected,
      lastMessage,
      subscribe,
      subscribeConnection,
      reconnectNow: connect,
      close,
    }),
    [isConnected, lastMessage, subscribe, subscribeConnection, connect, close],
  );

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
}

/** Internal — use `hooks/useWebSocket.ts` from components instead. */
export function useWebSocketContext(): WebSocketContextValue {
  const ctx = useContext(WebSocketContext);
  if (!ctx) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return ctx;
}
