'use client';

import { useState, useEffect, useRef } from 'react';
import { getApiUrl } from '@/lib/api-config';
import { zatToZec } from '@/lib/format-numbers';

export type CurrencyMode = 'zec' | 'usd';

const STORAGE_KEY = 'cipherscan-currency-mode';

export function useCurrencyToggle() {
  const [mode, setMode] = useState<CurrencyMode>('zec');
  const [price, setPrice] = useState<number | null>(null);
  const initialized = useRef(false);

  // Read persisted preference after mount (avoids SSR hydration clobbering)
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as CurrencyMode | null;
    if (saved === 'usd' || saved === 'zec') {
      setMode(saved);
    }
    initialized.current = true;
  }, []);

  // Persist only after the initial read
  useEffect(() => {
    if (!initialized.current) return;
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    let cancelled = false;
    async function fetchPrice() {
      try {
        const res = await fetch(`${getApiUrl()}/api/price`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && typeof data.price === 'number') {
            setPrice(data.price);
          }
        }
      } catch {}
    }
    fetchPrice();
    const id = setInterval(fetchPrice, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const toggle = () => setMode((m) => (m === 'zec' ? 'usd' : 'zec'));

  return { mode, setMode, toggle, price };
}

/**
 * Format a zatoshi value as ZEC or USD depending on mode.
 * Returns a compact string like "18,590 ZEC" or "$9,042,340".
 */
export function fmtValue(
  zat: number,
  mode: CurrencyMode,
  price: number | null,
): string {
  const zec = zatToZec(zat);
  if (mode === 'usd' && price != null) {
    const usd = zec * price;
    if (Math.abs(usd) >= 1_000_000_000) {
      return `$${(usd / 1_000_000_000).toFixed(2)}B`;
    }
    if (Math.abs(usd) >= 1_000_000) {
      return `$${(usd / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(usd) >= 1_000) {
      return `$${Math.round(usd).toLocaleString()}`;
    }
    return `$${usd.toFixed(2)}`;
  }
  if (Math.abs(zec) >= 1000) return `${Math.round(zec).toLocaleString()} ZEC`;
  return `${zec.toLocaleString(undefined, { maximumFractionDigits: 2 })} ZEC`;
}
