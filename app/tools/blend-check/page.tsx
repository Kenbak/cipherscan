'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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

interface SplitPiece {
  amount: number;
  blendScore: number;
  blendLabel: string;
  count30d: number;
  isRemainder: boolean;
}

interface SplitPlan {
  pieceCount: number;
  pieces: SplitPiece[];
  minBlendScore: number;
  avgBlendScore: number;
  overallLabel: string;
  recommended?: boolean;
}

interface SplitResult {
  amount: number;
  plans: SplitPlan[];
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

function getScoreBg(score: number): string {
  if (score >= 70) return 'bg-cipher-green';
  if (score >= 40) return 'bg-amber-400';
  return 'bg-red-400';
}

function getScoreBorder(score: number): string {
  if (score >= 70) return 'border-cipher-green/20';
  if (score >= 40) return 'border-amber-400/20';
  return 'border-red-400/20';
}

function getVerdict(score: number): { icon: string; headline: string; body: string } {
  if (score >= 70) return {
    icon: '✓',
    headline: 'You blend in',
    body: 'This amount is common on-chain. Your transaction will look like thousands of others.',
  };
  if (score >= 40) return {
    icon: '~',
    headline: 'You partially blend in',
    body: 'This amount is somewhat common, but a rounder number would be better. See suggestions below.',
  };
  return {
    icon: '!',
    headline: 'You stand out',
    body: 'This amount is rare on-chain. An observer could link your deposit to a future withdrawal. Split it or use a rounder number.',
  };
}

export default function BlendCheckPage() {
  const [amount, setAmount] = useState('');
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [splitResult, setSplitResult] = useState<SplitResult | null>(null);
  const [selectedPlanIdx, setSelectedPlanIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>(null);
  const abortRef = useRef<AbortController>(null);

  const fetchCheck = useCallback(async (amt: string) => {
    const parsed = parseFloat(amt);
    if (isNaN(parsed) || parsed <= 0) {
      setResult(null);
      setSplitResult(null);
      setError('');
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError('');

    try {
      const [blendRes, splitRes] = await Promise.all([
        fetch(
          `${API_CONFIG.POSTGRES_API_URL}/api/blend-check?amount=${parsed}&tolerance=2`,
          { signal: controller.signal }
        ),
        fetch(
          `${API_CONFIG.POSTGRES_API_URL}/api/blend-check/split?amount=${parsed}`,
          { signal: controller.signal }
        ),
      ]);

      if (!blendRes.ok) throw new Error(`API error: ${blendRes.status}`);
      const blendData = await blendRes.json();
      setResult(blendData);

      if (splitRes.ok) {
        const splitData = await splitRes.json();
        setSplitResult(splitData);
        setSelectedPlanIdx(0);
      }
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
    if (!amount) { setResult(null); setSplitResult(null); return; }

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

  const hasResult = result && !loading;
  const score = result?.blendScore ?? 0;
  const verdict = getVerdict(score);
  const crowd30d = result?.periods['30d'].total ?? 0;

  // Best nearby suggestion (if score < 70 and there's a better option)
  const bestNearby = hasResult && score < 70
    ? result.nearbyPopular.find(np => {
        const npScore = np.count >= 1000 ? 75 : np.count >= 500 ? 65 : np.count >= 100 ? 50 : 0;
        return npScore > score && Math.abs(np.amount - result.amount) / result.amount < 0.5;
      })
    : null;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">

      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-2xl sm:text-3xl font-semibold text-primary tracking-tight">
          Blend Check
        </h1>
        <p className="text-sm text-secondary mt-2">
          Check if your amount blends in with the crowd before shielding.
        </p>
      </div>

      {/* Amount input */}
      <div className="card animate-fade-in-up" style={{ animationDelay: '50ms' }}>
        <label className="text-xs font-mono text-muted uppercase tracking-wider block mb-3">
          How much are you shielding?
        </label>
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={handleAmountChange}
            placeholder="0.00"
            className="w-full px-5 py-4 rounded-xl bg-glass-3 border border-glass-6 text-2xl font-mono text-primary placeholder:text-muted/20 focus:outline-none focus:border-cipher-cyan/40 focus:shadow-[0_0_0_3px_rgba(0,212,255,0.06)] transition-all"
            autoFocus
          />
          <span className="absolute right-5 top-1/2 -translate-y-1/2 text-muted/40 font-mono text-lg">
            ZEC
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[0.1, 1, 2.5, 5, 10, 25, 50, 100].map((q) => (
            <button
              key={q}
              onClick={() => handleSuggestionClick(q)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition-all ${
                amount === formatZec(q)
                  ? 'border-cipher-cyan/40 bg-cipher-cyan/10 text-cipher-cyan'
                  : 'border-glass-6 bg-glass-2 text-muted/60 hover:text-primary hover:border-glass-12'
              }`}
            >
              {q}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-muted/50 text-xs font-mono mt-5">
            <div className="animate-spin rounded-full h-3 w-3 border border-cipher-cyan border-t-transparent" />
            Scanning shielded pool...
          </div>
        )}

        {error && (
          <div className="text-red-400 text-xs font-mono mt-5">{error}</div>
        )}
      </div>

      {/* ── Results ── */}
      {hasResult && (
        <div className="mt-6 space-y-5 animate-fade-in-up" style={{ animationDelay: '100ms' }}>

          {/* Verdict card */}
          <div className={`card border ${getScoreBorder(score)}`}>
            <div className="flex items-start gap-4">
              {/* Score circle */}
              <div className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 ${getScoreBg(score)}/10 border ${getScoreBorder(score)}`}>
                <span className={`text-2xl font-bold font-mono ${getScoreColor(score)}`}>
                  {score}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <h2 className={`text-lg font-semibold ${getScoreColor(score)}`}>
                  {verdict.headline}
                </h2>
                <p className="text-sm text-secondary mt-1">
                  {verdict.body}
                </p>

                {/* Crowd size — single prominent number */}
                <div className="mt-3 flex items-center gap-2 text-xs text-muted font-mono">
                  <span className="text-primary font-semibold">{formatNumber(crowd30d)}</span>
                  similar transactions in the last 30 days
                </div>
              </div>
            </div>

            {/* Score bar */}
            <div className="mt-4 w-full h-1.5 rounded-full bg-glass-6 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${getScoreBg(score)}`}
                style={{ width: `${Math.max(score, 3)}%` }}
              />
            </div>
          </div>

          {/* Quick suggestion: round to a nearby popular amount */}
          {bestNearby && (
            <button
              onClick={() => handleSuggestionClick(bestNearby.amount)}
              className="w-full card border border-cipher-cyan/10 hover:border-cipher-cyan/30 transition-all group text-left"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-primary">
                    Try <span className="font-mono font-semibold text-cipher-cyan">{formatZec(bestNearby.amount)} ZEC</span> instead?
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    {formatNumber(bestNearby.count)} others used this amount recently
                  </p>
                </div>
                <svg className="w-4 h-4 text-muted group-hover:text-cipher-cyan transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          )}

          {/* Split Plan — only show if score < 70 or there are valid plans */}
          {splitResult && splitResult.plans.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-primary mb-1">
                {score >= 70 ? 'Want to split it anyway?' : 'Suggested Split'}
              </h3>
              <p className="text-xs text-muted mb-5">
                {score >= 70
                  ? 'Your amount already blends well, but splitting into multiple transactions adds extra privacy.'
                  : 'Break your amount into common pieces so each one blends in separately.'}
              </p>

              {/* Plan tabs */}
              <div className="flex flex-wrap gap-2 mb-4">
                {splitResult.plans.map((plan, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedPlanIdx(i)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition-all ${
                      selectedPlanIdx === i
                        ? 'border-cipher-cyan/40 bg-cipher-cyan/10 text-cipher-cyan'
                        : 'border-glass-6 bg-glass-2 text-muted/60 hover:text-primary hover:border-glass-12'
                    }`}
                  >
                    {plan.pieceCount} transaction{plan.pieceCount !== 1 ? 's' : ''}
                    {plan.recommended && (
                      <span className="ml-1.5 text-cipher-green">recommended</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Selected plan — visual pipeline */}
              {(() => {
                const plan = splitResult.plans[selectedPlanIdx];
                if (!plan) return null;

                return (
                  <div className="space-y-0">
                    {plan.pieces.map((piece, i) => (
                      <div key={i} className="flex items-stretch">
                        {/* Connector line */}
                        <div className="w-8 flex flex-col items-center shrink-0">
                          <div className={`w-2.5 h-2.5 rounded-full shrink-0 border-2 ${
                            piece.isRemainder && piece.blendScore < 40
                              ? 'border-amber-400 bg-amber-400/20'
                              : `border-current ${getScoreColor(piece.blendScore)} bg-transparent`
                          }`}
                            style={piece.blendScore >= 70 ? { borderColor: 'rgb(var(--color-green-rgb, 34 197 94))', backgroundColor: 'rgba(var(--color-green-rgb, 34 197 94), 0.2)' } : undefined}
                          />
                          {i < plan.pieces.length - 1 && (
                            <div className="w-px flex-1 bg-glass-8 my-0.5" />
                          )}
                        </div>

                        {/* Piece card */}
                        <div className={`flex-1 mb-2 px-4 py-3 rounded-lg border transition-all ${
                          piece.isRemainder && piece.blendScore < 40
                            ? 'border-amber-400/15 bg-amber-400/5'
                            : 'border-glass-6 bg-glass-2'
                        }`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className={`font-mono text-sm font-semibold ${
                                piece.isRemainder && piece.blendScore < 40 ? 'text-amber-400' : 'text-primary'
                              }`}>
                                {formatZec(piece.amount)} ZEC
                              </span>
                              {piece.isRemainder && (
                                <span className="text-[10px] font-mono text-amber-400/70 bg-amber-400/10 px-2 py-0.5 rounded-full">
                                  leftover
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-12 h-1 rounded-full bg-glass-6 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${getScoreBg(piece.blendScore)}`}
                                  style={{ width: `${Math.max(piece.blendScore, 5)}%` }}
                                />
                              </div>
                              <span className={`text-[10px] font-mono ${getScoreColor(piece.blendScore)}`}>
                                {piece.blendScore}
                              </span>
                            </div>
                          </div>

                          {/* Contextual label */}
                          <p className="text-[10px] text-muted mt-1 font-mono">
                            {piece.isRemainder && piece.blendScore < 40
                              ? 'Shield this separately, at a different time'
                              : piece.blendScore >= 70
                              ? `Blends in — ${formatNumber(piece.count30d)} similar txs recently`
                              : `Moderate — ${formatNumber(piece.count30d)} similar txs recently`
                            }
                          </p>
                        </div>
                      </div>
                    ))}

                    {/* Summary + copy */}
                    <div className="mt-3 pt-3 border-t border-glass-6 flex items-center justify-between">
                      <p className="text-xs text-muted font-mono">
                        Weakest piece: <span className={getScoreColor(plan.minBlendScore)}>{plan.minBlendScore}/100</span>
                      </p>
                      <button
                        onClick={() => {
                          const text = plan.pieces
                            .map((p, i) => `${i + 1}. ${formatZec(p.amount)} ZEC${p.isRemainder ? ' (shield later)' : ''}`)
                            .join('\n');
                          navigator.clipboard.writeText(text);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="text-xs font-mono text-cipher-cyan hover:text-cipher-cyan/80 transition-colors flex items-center gap-1.5"
                      >
                        {copied ? (
                          <>
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Copied
                          </>
                        ) : (
                          <>
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Copy amounts
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Popular amounts nearby */}
          {result.nearbyPopular.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-primary mb-1">Popular amounts nearby</h3>
              <p className="text-xs text-muted mb-4">
                Click any amount to check its score. Based on 30-day shielded pool data.
              </p>
              <div className="space-y-1">
                {result.nearbyPopular.slice(0, 6).map((np, i) => {
                  const isSelected = Math.abs(np.amount - result.amount) / result.amount < 0.02;
                  const maxCount = result.nearbyPopular[0].count;
                  const barPct = Math.max((np.count / maxCount) * 100, 4);
                  return (
                    <button
                      key={i}
                      onClick={() => handleSuggestionClick(np.amount)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-all text-left group ${
                        isSelected
                          ? 'border-cipher-cyan/30 bg-cipher-cyan/5'
                          : 'border-transparent hover:border-glass-6 hover:bg-glass-2'
                      }`}
                    >
                      <span className={`font-mono text-sm w-24 shrink-0 ${isSelected ? 'text-cipher-cyan font-semibold' : 'text-primary'}`}>
                        {formatZec(np.amount)}
                      </span>
                      <div className="flex-1 h-1 rounded-full bg-glass-4 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isSelected ? 'bg-cipher-cyan/60' : 'bg-glass-12 group-hover:bg-glass-18'
                          }`}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-muted w-14 text-right">
                        {formatNumber(np.count)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Why does this matter? */}
          <div className="card">
            <button
              onClick={() => setShowWhy(!showWhy)}
              className="w-full flex items-center justify-between text-left"
            >
              <h3 className="text-sm font-semibold text-primary">Why does this matter?</h3>
              <svg
                className={`w-4 h-4 text-muted transition-transform ${showWhy ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showWhy && (
              <div className="mt-4 space-y-3 text-sm text-secondary leading-relaxed">
                <p>
                  When you shield ZEC, you move it from a public address into the private shielded pool. The <strong className="text-primary">amount</strong> you shield is visible on-chain, even though your future activity is hidden.
                </p>
                <p>
                  If you shield an unusual amount like <span className="font-mono text-primary">7.31924 ZEC</span>, an observer can search the blockchain for that exact number. If someone later deshields <span className="font-mono text-primary">7.31924 ZEC</span>, it&apos;s a strong signal those two transactions are linked — breaking your privacy.
                </p>
                <p>
                  By using <strong className="text-primary">common, round amounts</strong> (like 1, 5, or 10 ZEC), you become indistinguishable from thousands of other users who shielded the same amount. That&apos;s the crowd you&apos;re hiding in.
                </p>
                <div className="pt-3 border-t border-glass-6 space-y-2 text-xs text-muted font-mono">
                  <p className="flex gap-2">
                    <span className="text-cipher-cyan shrink-0">$</span>
                    Use round numbers: 1, 2.5, 5, 10, 25, 50, 100 ZEC
                  </p>
                  <p className="flex gap-2">
                    <span className="text-cipher-cyan shrink-0">$</span>
                    Split large or odd amounts into multiple transactions
                  </p>
                  <p className="flex gap-2">
                    <span className="text-cipher-cyan shrink-0">$</span>
                    Shield the leftover at a different time to avoid correlation
                  </p>
                  <p className="flex gap-2">
                    <span className="text-cipher-cyan shrink-0">$</span>
                    Use a unified address (u1...) for maximum privacy
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasResult && !loading && (
        <div className="card mt-6 flex items-center justify-center min-h-[200px] animate-fade-in">
          <p className="text-sm text-muted/40 font-mono text-center">
            Enter an amount to see<br />how well it blends on-chain
          </p>
        </div>
      )}
    </div>
  );
}
