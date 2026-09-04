import { useEffect, useRef } from 'react';
import { useWebSocketContext, type WebSocketMessage } from '@/contexts/WebSocketContext';

export type { WebSocketMessage };

interface UseWebSocketOptions {
  onMessage?: (data: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  /**
   * Retained for interface compatibility with existing call sites. The
   * shared connection (see `contexts/WebSocketContext.tsx`) owns its own
   * backoff+jitter reconnect schedule, so a per-consumer interval no longer
   * has an effect — no current caller sets this to a non-default value.
   */
  reconnectInterval?: number;
}

/**
 * Thin per-component adapter over the single app-level WebSocket connection
 * (`WebSocketProvider`). Preserves the exact return shape/options this hook
 * has always had so every existing consumer (RecentBlocks, MempoolClient,
 * usePaginatedList, etc.) keeps working unchanged: components no longer each
 * open their own socket, they subscribe to one shared fan-out.
 */
export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { onMessage, onConnect, onDisconnect } = options;
  const ctx = useWebSocketContext();

  // Refs so subscribing doesn't churn on every render when callers pass
  // inline arrow functions (the overwhelmingly common call pattern here).
  const onMessageRef = useRef(onMessage);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  onMessageRef.current = onMessage;
  onConnectRef.current = onConnect;
  onDisconnectRef.current = onDisconnect;

  useEffect(() => {
    return ctx.subscribe((message) => onMessageRef.current?.(message));
  }, [ctx]);

  useEffect(() => {
    return ctx.subscribeConnection((connected) => {
      if (connected) onConnectRef.current?.();
      else onDisconnectRef.current?.();
    });
  }, [ctx]);

  return {
    isConnected: ctx.isConnected,
    lastMessage: ctx.lastMessage,
    // No current consumer calls these, but they're kept for interface
    // compatibility. Because the connection is now shared app-wide, both
    // now act on the single shared socket rather than a private one.
    disconnect: ctx.close,
    reconnect: ctx.reconnectNow,
  };
}
