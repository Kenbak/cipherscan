'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { API_CONFIG } from '@/lib/api-config';

interface PeriodResult {
  total: number;
  shields: number;
  deshields: number;
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

function formatNumber(n: number | undefined): string {
  if (n == null) return '0';
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
  if (score >= 70) return 'text-cipher-green';
  if (score >= 40) return 'text-amber-400';
  return 'text-red-400';
}

function getBarColor(score: number): string {
  if (score >= 70) return 'bg-gradient-to-r from-cipher-green/80 to-cipher-green';
  if (score >= 40) return 'bg-gradient-to-r from-amber-500/80 to-amber-400';
  return 'bg-gradient-to-r from-red-500/80 to-red-400';
}

export default function BlendCheckPage() {
  const [amount, setAmount] = useState('');
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<NodeJS.Timeout>(null);
  const abortRef = useRef<AbortController>(null);

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
        `${API_CONFIG.POSTGRES_API_URL}/api/blend-check?amount=${parsed}&tolerance=2`,
        { signal: controller.signal }
      );
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      setResult(data);
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') {
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
    '24h': '24H',
    '7d': '7D',
    '30d': '30D',
    'all': 'ALL TIME',
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
          <span className="opacity-50">{'>'}</span> BLEND_CHECK
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-primary">
          Do You Blend In?
        </h1>
        <div className="flex items-start gap-3 mt-3">
          <div className="w-[2px] h-8 bg-gradient-to-b from-cipher-purple/60 to-cipher-purple/0 shrink-0 mt-0.5" />
          <p className="text-sm text-muted font-mono italic">
            &quot;If you shield 7.3192 ZEC, you stand out. Shield 1.25 and you look like thousands of others.&quot;
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column: Input */}
        <div className="animate-fade-in-up" style={{ animationDelay: '50ms' }}>
          <div className="card">
            <div className="flex items-center gap-2 mb-5">
              <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
              <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">ENTER_AMOUNT</h2>
            </div>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={handleAmountChange}
                placeholder="0.00"
                className="w-full px-5 py-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-2xl font-mono text-primary placeholder:text-muted/20 focus:outline-none focus:border-cipher-purple/40 focus:shadow-[0_0_0_3px_rgba(147,51,234,0.06)] transition-all"
                autoFocus
              />
              <span className="absolute right-5 top-1/2 -translate-y-1/2 text-muted/40 font-mono text-lg">
                ZEC
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {[0.01, 0.1, 1, 2.5, 5, 10, 25, 50, 100].map((q) => (
                <button
                  key={q}
                  onClick={() => handleSuggestionClick(q)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition-all ${
                    amount === formatZec(q)
                      ? 'border-cipher-purple/40 bg-cipher-purple/10 text-cipher-purple'
                      : 'border-white/[0.06] bg-white/[0.02] text-muted/60 hover:text-primary hover:border-white/[0.12]'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>

            {loading && (
              <div className="flex items-center gap-2 text-muted/50 text-xs font-mono mt-5">
                <div className="animate-spin rounded-full h-3 w-3 border border-cipher-purple border-t-transparent" />
                Scanning shielded pool...
              </div>
            )}

            {error && (
              <div className="text-red-400 text-xs font-mono mt-5">{error}</div>
            )}

            {/* Blend Score */}
            {result && !loading && (
              <div className="mt-6 pt-6 border-t border-white/[0.06]">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
                  <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">BLEND_SCORE</h2>
                </div>
                <div className="flex items-end gap-3 mb-3">
                  <span className={`text-5xl font-bold font-mono ${getScoreColor(result.blendScore)}`}>
                    {result.blendScore}
                  </span>
                  <span className="text-lg text-muted/30 font-mono mb-1">/100</span>
                  <span className={`text-sm font-mono mb-1.5 ${getScoreColor(result.blendScore)}`}>
                    {result.blendLabel}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${getBarColor(result.blendScore)}`}
                    style={{ width: `${Math.max(result.blendScore, 3)}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted/40 font-mono mt-2">
                  {result.blendScore >= 70
                    ? 'This amount is common on-chain. You blend in.'
                    : result.blendScore >= 40
                    ? 'This amount is moderately common. Consider a rounder number.'
                    : 'This amount is rare. You will stand out on-chain.'}
                </p>
              </div>
            )}
          </div>

          {/* Tips */}
          <div className="card mt-6 animate-fade-in-up" style={{ animationDelay: '150ms' }}>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
              <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">TIPS</h2>
            </div>
            <ul className="space-y-2.5 text-sm text-muted/70">
              <li className="flex gap-2 font-mono">
                <span className="text-cipher-purple shrink-0">$</span>
                Use round numbers: 1, 2.5, 5, 10, 25, 50, 100 ZEC
              </li>
              <li className="flex gap-2 font-mono">
                <span className="text-cipher-purple shrink-0">$</span>
                Split large amounts into multiple common-sized txs
              </li>
              <li className="flex gap-2 font-mono">
                <span className="text-cipher-purple shrink-0">$</span>
                Avoid precise amounts like 7.31924 — they fingerprint you
              </li>
              <li className="flex gap-2 font-mono">
                <span className="text-cipher-purple shrink-0">$</span>
                Shield to a unified address (u1) for maximum privacy
              </li>
            </ul>
          </div>
        </div>

        {/* Right column: Results */}
        <div className="animate-fade-in-up" style={{ animationDelay: '100ms' }}>
          {result && !loading ? (
            <div className="space-y-6">
              {/* Period breakdown with shield/deshield split */}
              <div className="card">
                <div className="flex items-center gap-2 mb-5">
                  <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
                  <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">SHIELDED_POOL_MATCHES</h2>
                </div>
                <div className="grid grid-cols-2 gap-3">
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
                        <div className="text-xl sm:text-2xl font-bold font-mono text-primary">
                          {formatNumber(d.total)}
                        </div>
                        <div className="flex items-center gap-3 mt-2">
                          <div className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-cipher-green/60" />
                            <span className="text-[10px] font-mono text-muted/50">
                              {formatNumber(d.shields)} in
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-cipher-purple/60" />
                            <span className="text-[10px] font-mono text-muted/50">
                              {formatNumber(d.deshields)} out
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center gap-4 text-[10px] font-mono text-muted/30">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-cipher-green/60" />
                    <span>in = shields (t → z)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-cipher-purple/60" />
                    <span>out = deshields (z → t)</span>
                  </div>
                </div>
              </div>

              {/* Nearby popular amounts */}
              {result.nearbyPopular.length > 0 && (
                <div className="card">
                  <div className="flex items-center gap-2 mb-5">
                    <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
                    <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">POPULAR_NEARBY</h2>
                  </div>
                  <div className="space-y-1.5">
                    {result.nearbyPopular.slice(0, 8).map((np, i) => {
                      const isSelected = Math.abs(np.amount - result.amount) / result.amount < 0.02;
                      const maxCount = result.nearbyPopular[0].count;
                      const barPct = Math.max((np.count / maxCount) * 100, 4);
                      return (
                        <button
                          key={i}
                          onClick={() => handleSuggestionClick(np.amount)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left group ${
                            isSelected
                              ? 'border-cipher-purple/30 bg-cipher-purple/5'
                              : 'border-transparent hover:border-white/[0.06] hover:bg-white/[0.02]'
                          }`}
                        >
                          <span className={`font-mono text-sm w-28 shrink-0 ${isSelected ? 'text-cipher-purple' : 'text-primary'}`}>
                            {formatZec(np.amount)}
                          </span>
                          <div className="flex-1 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                isSelected ? 'bg-cipher-purple/60' : 'bg-white/[0.12] group-hover:bg-white/[0.18]'
                              }`}
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono text-muted/40 w-16 text-right">
                            {formatNumber(np.count)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted/30 font-mono mt-3">
                    Click any amount to check it. Based on 30-day shielded pool data.
                  </p>
                </div>
              )}
            </div>
          ) : !loading && (
            <div className="card h-full flex items-center justify-center min-h-[300px]">
              <div className="text-center">
                <p className="text-sm text-muted/40 font-mono">
                  Enter an amount to see<br />how well it blends on-chain
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
