'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import type { ActiveTab, LookupState, RawTxData, TransactionData } from './types';
import { transformExpressTxData } from './transform-tx-data';

export function useTransactionPage(txid: string) {
  const router = useRouter();
  const [data, setData] = useState<TransactionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lookupState, setLookupState] = useState<LookupState>(null);
  const [blockFallbackChecked, setBlockFallbackChecked] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('summary');
  const [rawData, setRawData] = useState<RawTxData | null>(null);
  const [rawLoading, setRawLoading] = useState(false);
  const [priceUsd, setPriceUsd] = useState<number | null>(null);
  const [mempoolTx, setMempoolTx] = useState<any>(null);
  const [mempoolChecked, setMempoolChecked] = useState(false);
  const [mempoolConfirming, setMempoolConfirming] = useState(false);
  const mempoolPollRef = useRef<NodeJS.Timeout | null>(null);
  const [mempoolElapsed, setMempoolElapsed] = useState(0);
  const mempoolTimerRef = useRef<NodeJS.Timeout | null>(null);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(label);
      setTimeout(() => setCopiedText(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        const apiUrl = usePostgresApiClient()
          ? `${getApiUrl()}/api/tx/${txid}`
          : `/api/tx/${txid}`;

        const response = await fetch(apiUrl);

        if (!response.ok) {
          if (response.status === 404 && /^[a-fA-F0-9]{64}$/.test(txid)) {
            try {
              const finalizerRes = await fetch(`${getApiUrl()}/api/finalizer/${txid.toLowerCase()}`);
              if (finalizerRes.ok) {
                router.replace(`/finalizer/${txid.toLowerCase()}`);
                return;
              }
            } catch {
              /* fall through to not-found */
            }
          }
          setLookupState(response.status === 404 ? 'missing' : 'unavailable');
          throw new Error(
            response.status === 404 ? 'Transaction not found' : 'Transaction lookup unavailable',
          );
        }

        const txData = await response.json();
        setLookupState('available');

        if (usePostgresApiClient()) {
          setData(transformExpressTxData(txData));
        } else {
          setData(txData);
        }
      } catch (error) {
        console.error('Error fetching transaction:', error);
        if (!(error instanceof Error && error.message === 'Transaction not found')) {
          setLookupState('unavailable');
        }
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [txid, router]);

  useEffect(() => {
    if (!data || !data.timestamp) return;
    const date = new Date(data.timestamp * 1000).toISOString().split('T')[0];
    fetch(`${getApiUrl()}/api/price/at?date=${date}`)
      .then((res) => res.json())
      .then((p) => {
        if (p.price_usd) setPriceUsd(p.price_usd);
      })
      .catch(() => {});
  }, [data?.timestamp]);

  useEffect(() => {
    if (loading || data || blockFallbackChecked || lookupState !== 'missing') return;
    if (!/^[a-fA-F0-9]{64}$/.test(txid)) return;

    setBlockFallbackChecked(true);

    const checkBlock = async () => {
      try {
        const apiUrl = usePostgresApiClient()
          ? `${getApiUrl()}/api/block/${txid}`
          : `/api/block/${txid}`;
        const res = await fetch(apiUrl);
        if (res.ok) {
          router.replace(`/block/${txid}`);
        }
      } catch {
        // Not a block hash either — stay on the "not found" view
      }
    };

    checkBlock();
  }, [loading, data, txid, blockFallbackChecked, lookupState, router]);

  const checkMempool = useCallback(async () => {
    try {
      const apiUrl = usePostgresApiClient()
        ? `${getApiUrl()}/api/mempool/tx/${txid}`
        : `/api/mempool/tx/${txid}`;
      const res = await fetch(apiUrl);
      if (!res.ok) {
        setLookupState('unavailable');
        return null;
      }
      const result = await res.json();
      if (result.success && result.inMempool) {
        setLookupState('available');
        setMempoolTx(result.transaction);
        return true;
      }
      return false;
    } catch {
      setLookupState('unavailable');
      return null;
    }
  }, [txid]);

  useEffect(() => {
    if (loading || data || !blockFallbackChecked || mempoolChecked || lookupState !== 'missing') return;
    if (!/^[a-fA-F0-9]{64}$/.test(txid)) return;

    setMempoolChecked(true);
    checkMempool();
  }, [loading, data, blockFallbackChecked, txid, mempoolChecked, lookupState, checkMempool]);

  useEffect(() => {
    if (!mempoolTx || data) return;

    const startTime = Date.now();
    setMempoolElapsed(0);

    mempoolTimerRef.current = setInterval(() => {
      setMempoolElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    let droppedAt: number | null = null;

    const poll = async () => {
      try {
        const apiUrl = usePostgresApiClient()
          ? `${getApiUrl()}/api/tx/${txid}`
          : `/api/tx/${txid}`;
        const res = await fetch(apiUrl);
        if (res.ok) {
          window.location.reload();
          return;
        }

        const stillInMempool = await checkMempool();
        if (stillInMempool === null) return;
        if (!stillInMempool && !droppedAt) {
          droppedAt = Date.now();
          setMempoolConfirming(true);
        }

        if (droppedAt && Date.now() - droppedAt > 120_000) {
          setMempoolTx(null);
          setMempoolConfirming(false);
        }
      } catch {}
    };

    mempoolPollRef.current = setInterval(poll, 5_000);

    return () => {
      if (mempoolPollRef.current) clearInterval(mempoolPollRef.current);
      if (mempoolTimerRef.current) clearInterval(mempoolTimerRef.current);
    };
  }, [mempoolTx, data, txid, checkMempool]);

  return {
    data,
    loading,
    lookupState,
    blockFallbackChecked,
    copiedText,
    copyToClipboard,
    activeTab,
    setActiveTab,
    rawData,
    setRawData,
    rawLoading,
    setRawLoading,
    priceUsd,
    mempoolTx,
    mempoolChecked,
    mempoolConfirming,
    mempoolElapsed,
  };
}
