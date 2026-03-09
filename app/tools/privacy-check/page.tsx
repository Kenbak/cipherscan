'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { API_CONFIG } from '@/lib/api-config';

interface PeriodResult {
  matches: number;
  total: number;
  percentage: number;
}

interface NearbyAmount {
  amount: number;
  count: number;
}

interface CheckResult {
  amount: number;
  tolerancePercent: number;
  periods: {
    '24h': PeriodResult;
    '7d': PeriodResult;
    '30d': PeriodResult;
    'all': PeriodResult;
  };
  blendScore: number;
  blendLabel: string;
  nearbyPopular: NearbyAmount[];
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function formatZec(n: number): string {
  if (n >= 1000) return n.toFixed(2);
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(8);
}

function getScoreColor(score: number): string {
  if (score >= 70) return 'text-emerald-400';
  if (score >= 40) return 'text-amber-400';
  return 'text-red-400';
}

function getScoreBg(score: number): string {
  if (score >= 70) return 'bg-emerald-400/10 border-emerald-400/20';
  if (score >= 40) return 'bg-amber-400/10 border-amber-400/20';
  return 'bg-red-400/10 border-red-400/20';
}

function getBarWidth(score: number): string {
  return `${Math.max(score, 3)}%`;
}

function getBarColor(score: number): string {
  if (score >= 70) return 'bg-emerald-400';
  if (score >= 40) return 'bg-amber-400';
  return 'bg-red-400';
}

export default function PrivacyCheckPage() {
  const [amount, setAmount] = useState('');
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<NodeJS.Timeout>();
  const abortRef = useRef<AbortController>();

  const fetchCheck = useCallback(async (amt: string) => {
    const parsed = parseFloat(amt);
    if (isNaN(parsed) || parsed <= 0) {
      setResult(null);
      setError('');
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(
        `${API_CONFIG.POSTGRES_API_URL}/api/privacy-check?amount=${parsed}&tolerance=2`,
        { signal: controller.signal }
      );
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setError('Failed to check amount');
        console.error(e);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!amount) { setResult(null); return; }

    debounceRef.current = setTimeout(() => fetchCheck(amount), 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [amount, fetchCheck]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '' || /^\d*\.?\d*$/.test(val)) {
      setAmount(val);
    }
  };

  const handleSuggestionClick = (amt: number) => {
    setAmount(formatZec(amt));
  };

  const periods = ['24h', '7d', '30d', 'all'] as const;
  const periodLabels: Record<string, string> = {
    '24h': '24 Hours',
    '7d': '7 Days',
    '30d': '30 Days',
    'all': 'All Time',
  };

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs text-muted/50 font-mono mb-4">
          <Link href="/tools" className="hover:text-cipher-cyan transition-colors">TOOLS</Link>
          <span>/</span>
          <span className="text-muted/80">PRIVACY_CHECK</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
          Amount Privacy Checker
        </h1>
        <p className="text-muted/60 text-sm max-w-2xl">
          Check how common a ZEC amount is on the blockchain. Use popular amounts
          to blend in with the crowd — if you shield 7.3192 ZEC you stand out,
          but 1.25 or 2.50 looks like thousands of others.
        </p>
      </div>

      {/* Input */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 mb-6">
        <label className="block text-xs font-mono text-muted/50 mb-2 uppercase tracking-wider">
          Enter ZEC Amount
        </label>
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={handleAmountChange}
            placeholder="0.00"
            className="w-full px-5 py-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-2xl font-mono text-primary placeholder:text-muted/20 focus:outline-none focus:border-cipher-cyan/40 focus:shadow-[0_0_0_3px_rgba(0,212,255,0.06)] transition-all"
            autoFocus
          />
          <span className="absolute right-5 top-1/2 -translate-y-1/2 text-muted/40 font-mono text-lg">
            ZEC
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[0.01, 0.1, 1, 2.5, 5, 10, 25, 50, 100].map((q) => (
            <button
              key={q}
              onClick={() => handleSuggestionClick(q)}
              className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs font-mono text-muted/60 hover:text-cipher-cyan hover:border-cipher-cyan/30 transition-all"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-muted/50 text-sm font-mono mb-6">
          <div className="w-3 h-3 rounded-full bg-cipher-cyan/50 animate-pulse" />
          Scanning blockchain...
        </div>
      )}

      {error && (
        <div className="text-red-400 text-sm font-mono mb-6">{error}</div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-6">
          {/* Blend Score */}
          <div className={`rounded-2xl border p-6 ${getScoreBg(result.blendScore)}`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs font-mono text-muted/50 uppercase tracking-wider mb-1">
                  Blend Score
                </div>
                <div className={`text-4xl font-bold font-mono ${getScoreColor(result.blendScore)}`}>
                  {result.blendScore}
                  <span className="text-lg text-muted/40 ml-1">/100</span>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-lg font-semibold ${getScoreColor(result.blendScore)}`}>
                  {result.blendLabel}
                </div>
                <div className="text-xs text-muted/40 font-mono mt-1">
                  {result.blendScore >= 70
                    ? 'This amount is common on-chain'
                    : result.blendScore >= 40
                    ? 'Consider a rounder number'
                    : 'This amount is very distinctive'}
                </div>
              </div>
            </div>
            <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${getBarColor(result.blendScore)}`}
                style={{ width: getBarWidth(result.blendScore) }}
              />
            </div>
          </div>

          {/* Period breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {periods.map((p) => {
              const d = result.periods[p];
              return (
                <div
                  key={p}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
                >
                  <div className="text-[10px] font-mono text-muted/40 uppercase tracking-wider mb-2">
                    {periodLabels[p]}
                  </div>
                  <div className="text-xl font-bold font-mono text-primary">
                    {formatNumber(d.matches)}
                  </div>
                  <div className="text-[10px] font-mono text-muted/40 mt-1">
                    of {formatNumber(d.total)} outputs
                  </div>
                  <div className="text-xs font-mono text-muted/50 mt-0.5">
                    {d.percentage >= 0.01 ? `${d.percentage.toFixed(2)}%` : d.matches > 0 ? '<0.01%' : '0%'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Nearby popular amounts */}
          {result.nearbyPopular.length > 0 && (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
              <div className="text-xs font-mono text-muted/50 uppercase tracking-wider mb-4">
                Popular Nearby Amounts (30d)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {result.nearbyPopular.map((np, i) => {
                  const isSelected = Math.abs(np.amount - result.amount) / result.amount < 0.02;
                  return (
                    <button
                      key={i}
                      onClick={() => handleSuggestionClick(np.amount)}
                      className={`flex items-center justify-between px-4 py-3 rounded-lg border transition-all text-left ${
                        isSelected
                          ? 'border-cipher-cyan/40 bg-cipher-cyan/5'
                          : 'border-white/[0.06] bg-white/[0.02] hover:border-cipher-cyan/20'
                      }`}
                    >
                      <span className={`font-mono text-sm ${isSelected ? 'text-cipher-cyan' : 'text-primary'}`}>
                        {formatZec(np.amount)} <span className="text-muted/40 text-xs">ZEC</span>
                      </span>
                      <span className="text-xs font-mono text-muted/40">
                        {formatNumber(np.count)}x
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted/40 font-mono mt-3">
                Click any amount to check it. Higher count = better privacy.
              </p>
            </div>
          )}

          {/* Tips */}
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
            <div className="text-xs font-mono text-muted/50 uppercase tracking-wider mb-3">
              Privacy Tips
            </div>
            <ul className="space-y-2 text-sm text-muted/60">
              <li className="flex gap-2">
                <span className="text-cipher-cyan shrink-0">{'>'}</span>
                Use round numbers that others commonly use (1, 2.5, 5, 10, 25, 50, 100 ZEC)
              </li>
              <li className="flex gap-2">
                <span className="text-cipher-cyan shrink-0">{'>'}</span>
                Split large amounts into multiple common-sized transactions over time
              </li>
              <li className="flex gap-2">
                <span className="text-cipher-cyan shrink-0">{'>'}</span>
                Avoid precise amounts like 7.31924 ZEC — they create a unique fingerprint
              </li>
              <li className="flex gap-2">
                <span className="text-cipher-cyan shrink-0">{'>'}</span>
                Shield to a unified address (u1) for maximum privacy
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
