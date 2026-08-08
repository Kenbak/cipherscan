'use client';

import { useEffect, useState } from 'react';
import { getApiUrl } from '@/lib/api-config';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { NETWORK_LABEL, NETWORK_COLOR } from '@/lib/config';
import { useCurrencyToggle, fmtValue } from '@/hooks/useCurrencyToggle';
import { zatToZec } from '@/lib/format-numbers';
import { TurnstileHero } from './TurnstileHero';
import {
  MetricsRow,
  SupplyVerification,
  IronwoodInflowCard,
  MigrationActivity,
  PrivacyScore,
  MigrationTiers,
  WalletReadiness,
  Resources,
} from './components';
import type { Cohorts, Overview, ScatterData } from './components';

export type { Cohort, Cohorts, Overview, ScatterData, ScatterTx } from './components';

const zec = zatToZec;
function fmtZec(zat: number): string {
  const z = zec(zat);
  if (Math.abs(z) >= 1000) return Math.round(z).toLocaleString();
  return z.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function MigrationClient({
  initialOverview,
  initialCohorts,
  initialDenominations: _initialDenominations,
  deploymentNetwork,
  fallbackActivationHeight,
}: {
  initialOverview: Overview | null;
  initialCohorts: Cohorts | null;
  initialDenominations: unknown;
  deploymentNetwork: 'mainnet' | 'testnet' | 'crosslink-testnet';
  fallbackActivationHeight: number;
}) {
  const [overview, setOverview] = useState<Overview | null>(initialOverview);
  const [cohorts, setCohorts] = useState<Cohorts | null>(initialCohorts);
  const [scatter, setScatter] = useState<ScatterData | null>(null);
  const [loaded, setLoaded] = useState(!!initialOverview);
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const { mode: currencyMode, toggle: toggleCurrency, price: zecPrice } = useCurrencyToggle();

  useEffect(() => {
    let cancelled = false;
    const base = getApiUrl();
    const fetchJson = (path: string) =>
      fetch(`${base}${path}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

    const loadOverview = () => {
      fetchJson('/api/migration/overview').then((result) => {
        if (cancelled) return;
        if (result?.success && result.network === deploymentNetwork) setOverview(result);
        setLoaded(true);
      });
    };

    const loadAnalytics = () => {
      Promise.all([
        fetchJson('/api/migration/cohorts'),
        fetchJson('/api/migration/scatter'),
      ]).then(([c, s]) => {
        if (cancelled) return;
        if (c?.success && c.network === deploymentNetwork) setCohorts(c);
        if (s?.success && s.network === deploymentNetwork) setScatter(s);
      });
    };

    loadOverview();
    loadAnalytics();
    const overviewId = setInterval(loadOverview, 10000);
    const analyticsId = setInterval(loadAnalytics, 60000);
    return () => {
      cancelled = true;
      clearInterval(overviewId);
      clearInterval(analyticsId);
    };
  }, [deploymentNetwork]);

  const activated = overview?.activated ?? false;
  const hasMigrations = (overview?.migration?.txCount ?? 0) > 0;
  const noData = loaded && (!overview || !overview.migration);

  const knownActivationHeight = overview?.activationHeight ?? fallbackActivationHeight;
  const knownTip = overview?.tipHeight || 0;

  const orchardToIronwoodZat = overview?.inflowSources?.fromOrchardZat ?? 0;
  const originalOrchard = (overview?.poolSizes.orchardZat ?? 0) + orchardToIronwoodZat;
  const migratedPct = originalOrchard > 0
    ? (orchardToIronwoodZat / originalOrchard) * 100
    : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">
            Zcash <span className="text-cipher-yellow-bright">Ironwood</span> Migration Tracker
          </h1>
          <p className="text-sm text-secondary mt-2 max-w-3xl leading-relaxed">
            Live tracking of the NU6.3 Orchard-to-Ironwood migration — pool balances, supply verification, cohort privacy, and migration velocity.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleCurrency}
            className="flex items-center rounded-full border border-cipher-border bg-glass-3 text-[11px] font-mono overflow-hidden"
          >
            <span className={`px-2.5 py-1 transition-colors ${currencyMode === 'zec' ? 'bg-cipher-yellow-bright/15 text-cipher-yellow-bright' : 'text-muted'}`}>ZEC</span>
            <span className={`px-2.5 py-1 transition-colors ${currencyMode === 'usd' ? 'bg-cipher-yellow-bright/15 text-cipher-yellow-bright' : 'text-muted'}`}>USD</span>
          </button>
          <span className={`text-[10px] font-mono ${NETWORK_COLOR} border border-current/20 rounded-full px-3 py-1`}>
            {NETWORK_LABEL}
          </span>
        </div>
      </div>

      {!loaded && !initialOverview ? (
        <div className="mt-8 h-80 sm:h-[420px] rounded-2xl border border-cipher-border bg-cipher-surface flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-cipher-border border-t-cipher-yellow rounded-full animate-spin" />
            <span className="text-xs font-mono text-muted">Loading migration data…</span>
          </div>
        </div>
      ) : noData ? (
        <div className="mt-8 rounded-xl border border-cipher-border bg-cipher-surface p-6 text-center">
          <h2 className="text-sm font-bold text-primary">Migration data unavailable</h2>
          <p className="text-xs text-muted mt-2">
            CipherScan could not load Ironwood data for this network. Try again shortly.
          </p>
        </div>
      ) : (
        <>
          {!activated ? (
            /* Pre-activation: countdown only */
            <MetricsRow
              overview={overview}
              activated={false}
              hasMigrations={false}
              activationHeight={knownActivationHeight}
              tipHeight={knownTip}
              migratedPct={0}
              deploymentNetwork={deploymentNetwork}
              colors={colors}
            />
          ) : (
            /* Post-activation: full dashboard */
            <>
              <MetricsRow
                overview={overview}
                activated={activated}
                hasMigrations={hasMigrations}
                activationHeight={knownActivationHeight}
                tipHeight={knownTip}
                migratedPct={migratedPct}
                deploymentNetwork={deploymentNetwork}
                colors={colors}
                currencyMode={currencyMode}
                zecPrice={zecPrice}
              />
              <SupplyVerification overview={overview} colors={colors} currencyMode={currencyMode} zecPrice={zecPrice} />
              {overview && (
                <TurnstileHero
                  activated={activated}
                  migratedPct={migratedPct}
                  blockPulseKey={overview.tipHeight}
                  activationHeight={knownActivationHeight}
                  tipHeight={knownTip}
                  cohorts={cohorts?.cohorts ?? null}
                  originalOrchardZat={originalOrchard}
                  currencyMode={currencyMode}
                  zecPrice={zecPrice}
                />
              )}
              {hasMigrations && overview?.inflowSources && overview.poolSizes && (
                <IronwoodInflowCard
                  sources={overview.inflowSources}
                  pools={overview.poolSizes}
                  colors={colors}
                  currencyMode={currencyMode}
                  zecPrice={zecPrice}
                />
              )}
              <MigrationActivity cohorts={cohorts} scatter={scatter} activated={activated} colors={colors} tipHeight={knownTip} currencyMode={currencyMode} zecPrice={zecPrice} />
              <PrivacyScore scatter={scatter} activated={activated} colors={colors} tipHeight={knownTip} />
              <MigrationTiers activated={activated} colors={colors} tipHeight={knownTip} currencyMode={currencyMode} zecPrice={zecPrice} />
              <WalletReadiness />
              <Resources />
            </>
          )}
        </>
      )}
    </div>
  );
}
