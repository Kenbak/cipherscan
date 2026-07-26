'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui';
import { PageSectionNav } from '@/components/PageSectionNav';
import { getChartColors } from '@/lib/chart-theme';
import { CURRENCY } from '@/lib/config';
import { usePostgresApiClient, getApiUrl, API_CONFIG } from '@/lib/api-config';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { useWebSocket } from '@/hooks/useWebSocket';
import { RecentShieldedTxs } from '@/components/RecentShieldedTxs';
import { useTheme } from '@/contexts/ThemeContext';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ChartWatermark } from '@/components/ChartWatermark';
import { AnonymitySetChart } from '@/components/privacy/AnonymitySetChart';
import { ShieldingDistributionChart } from '@/components/privacy/ShieldingDistributionChart';

// Format date for charts (shorter format)
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};


// Icons
const Icons = {
  Shield: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  TrendUp: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  TrendDown: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
    </svg>
  ),
  Lock: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
  Eye: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ),
  Chart: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  Star: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  ),
};

interface PrivacyStats {
  lastUpdated: string;
  lastBlockScanned: number;
  totals: {
    blocks: number;
    shieldedTx: number;
    transparentTx: number;
    coinbaseTx: number;
    totalTx: number;
    mixedTx: number;
    fullyShieldedTx: number;
  };
  shieldedPool: {
    currentSize: number;
    sprout?: number;
    sapling?: number;
    orchard?: number;
    ironwood?: number;
    transparent?: number;
    chainSupply?: number;
  };
  metrics: {
    shieldedPercentage: number;
    privacyScore: number;
    scoreBreakdown?: Record<string, { label: string; score: number; max: number; percent: number; detail: string }> | null;
    scoreVersion?: number;
    avgShieldedPerDay: number;
    adoptionTrend: 'growing' | 'stable' | 'declining';
  };
  trends: {
    daily: Array<{
      date: string;
      shielded: number;
      transparent: number;
      poolSize: number;
      shieldedPercentage: number;
      privacyScore: number;
    }>;
  };
}

export default function PrivacyClient() {
  const [stats, setStats] = useState<PrivacyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zecPrice, setZecPrice] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'adoption' | 'activity' | 'score'>('adoption');
  const { theme } = useTheme();
  const chartColors = getChartColors(theme);

  // WebSocket connection for real-time privacy stats updates
  const { isConnected } = useWebSocket({
    onMessage: (data) => {
      if (data.type === 'privacy_stats') {
        setStats(data.data);
        setLoading(false);
      }
    },
  });

  useEffect(() => {
    // Fetch privacy stats (initial load + fallback)
    // For testnet, call Express API directly; for mainnet, use Next.js API
    const apiUrl = usePostgresApiClient()
      ? `${getApiUrl()}/api/privacy-stats`
      : '/api/privacy-stats';

    fetch(apiUrl)
      .then((res) => res.json())
      .then((data) => {
        // Handle both direct Express API response and Next.js wrapper
        const statsData = data.success ? data.data : data;
        if (statsData && !statsData.error) {
          setStats(statsData);
        } else {
          setError(statsData.error || data.error || 'Failed to load privacy stats');
        }
        setLoading(false);
      })
      .catch((err) => {
        setError('Failed to fetch privacy stats');
        setLoading(false);
      });

    fetch(`${API_CONFIG.POSTGRES_API_URL}/api/price`)
      .then((res) => res.json())
      .then((data) => {
        setZecPrice(data.price);
      })
      .catch((err) => console.error('Failed to load ZEC price:', err));
  }, []);

  if (loading) {
    // Header is duplicated here so the server-rendered loading state still
    // contains the page heading and intro (matters for SEO and first paint).
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <PageHeader
          eyebrow="PRIVACY_DASHBOARD"
          title="Zcash Privacy Metrics"
          subtitle="Live metrics on how private the Zcash network actually is: the size of the Sapling and Orchard shielded pools, the share of transactions that shield, deshield, or stay fully shielded, and a network-wide privacy score computed from on-chain behavior."
        />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-cipher-purple border-t-transparent"></div>
          <p className="text-secondary ml-4 font-mono">Loading privacy statistics...</p>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <Card className="text-center">
          <CardBody className="py-16">
            <h1 className="text-2xl font-bold mb-4 text-primary">Privacy Stats Unavailable</h1>
            <p className="text-secondary mb-6">
              {error || 'Privacy statistics are being calculated. Check back soon!'}
            </p>
            <Link href="/" className="text-cipher-cyan hover:underline font-mono">
              Back to Explorer
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  const trendColor =
    stats.metrics.adoptionTrend === 'growing' ? 'text-cipher-green' :
    stats.metrics.adoptionTrend === 'declining' ? 'text-danger' :
    'text-secondary';

  const trendIcon =
    stats.metrics.adoptionTrend === 'growing' ? <Icons.TrendUp /> :
    stats.metrics.adoptionTrend === 'declining' ? <Icons.TrendDown /> :
    <Icons.Chart />;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">

        <PageHeader
          eyebrow="PRIVACY_DASHBOARD"
          title="Zcash Privacy Metrics"
          actions={
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-1.5 ${trendColor}`}>
                {trendIcon}
                <span className="text-xs font-mono capitalize">{stats.metrics.adoptionTrend}</span>
              </div>
              <span className="text-xs text-muted font-mono">
                {new Date(stats.lastUpdated).toLocaleTimeString()}
              </span>
            </div>
          }
        >
          {/* Eric Hughes quote */}
          <div className="mt-3 flex items-center gap-2">
            <div className="w-[2px] h-8 bg-gradient-to-b from-cipher-purple/60 to-cipher-purple/0 rounded-full"></div>
            <div>
              <p className="text-xs text-secondary font-mono leading-relaxed italic">
                &ldquo;Privacy is the power to selectively reveal oneself to the world.&rdquo;
              </p>
              <p className="text-[10px] text-muted font-mono mt-0.5">
                — Eric Hughes, A Cypherpunk&apos;s Manifesto, 1993
              </p>
            </div>
          </div>
        </PageHeader>

        <PageSectionNav
          sections={[
            { id: 'score', label: 'Score' },
            { id: 'activity', label: 'Activity' },
            { id: 'trends', label: 'Trends' },
            { id: 'distribution', label: 'Distribution' },
          ]}
          ariaLabel="Privacy dashboard sections"
          className="mb-8"
        />

        {/* Privacy Score + Key Metrics | Recent Shielded Activity */}
        <div id="score" className="scroll-mt-36 grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 animate-fade-in-up stagger-2">

          {/* Left Column: Privacy Score + Key Metrics */}
          <div className="space-y-6">
            {/* Privacy Score Hero */}
            <Card>
              <CardBody className="text-center py-8">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
                  <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">PRIVACY_SCORE</h2>
                </div>

                <div className="text-7xl font-bold mb-4 bg-gradient-to-r from-cipher-purple to-pink-400 bg-clip-text text-transparent">
                  {stats.metrics.privacyScore}
                  <span className="text-3xl text-muted">/100</span>
                </div>

                <div className="max-w-md mx-auto mb-6">
                  <div className="h-4 privacy-progress-bg rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cipher-purple to-cipher-purple-glow transition-all duration-1000"
                      style={{ width: `${stats.metrics.privacyScore}%` }}
                    />
                  </div>
                </div>

                <p className="text-sm text-muted max-w-md mx-auto mb-6">
                  Usage (35) · Quality (35) · Depth (15) · Hygiene (15) — rolling windows, not all-time totals.
                </p>
                {stats.metrics.scoreBreakdown ? (
                  <div className="mx-auto max-w-md space-y-2 text-left">
                    {(['usage', 'quality', 'depth', 'hygiene'] as const).map((key) => {
                      const row = stats.metrics.scoreBreakdown?.[key];
                      if (!row) return null;
                      return (
                        <div key={key}>
                          <div className="mb-1 flex justify-between text-[10px] font-mono text-muted">
                            <span>{row.label}</span>
                            <span>{row.score}/{row.max}</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-cipher-border/30">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-cipher-purple to-cipher-cyan"
                              style={{ width: `${row.max > 0 ? (row.score / row.max) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </CardBody>
            </Card>

            {/* Key Metrics 2x2 Grid */}
            <div className="grid grid-cols-2 gap-4">
              <Card variant="compact">
                <CardBody>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-cipher-purple/10 flex items-center justify-center text-cipher-purple">
                      <Icons.Lock />
                    </div>
                    <h3 className="text-xs font-semibold text-secondary uppercase">Shielded Tx %</h3>
                  </div>
                  <div className="text-2xl font-bold text-primary">
                    {stats.metrics.shieldedPercentage.toFixed(1)}%
                  </div>
                  <p className="text-xs text-muted mt-1">
                    {stats.totals.shieldedTx.toLocaleString()} txs
                  </p>
                </CardBody>
              </Card>

              <Card variant="compact">
                <CardBody>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-cipher-cyan/10 flex items-center justify-center text-cipher-cyan">
                      <Icons.Shield />
                    </div>
                    <h3 className="text-xs font-semibold text-secondary uppercase">Supply Shielded</h3>
                  </div>
                  <div className="text-2xl font-bold text-primary">
                    {stats.shieldedPool.chainSupply
                      ? ((stats.shieldedPool.currentSize / stats.shieldedPool.chainSupply) * 100).toFixed(1)
                      : '\u2014'}%
                  </div>
                  <p className="text-xs text-muted mt-1">
                    {(stats.shieldedPool.currentSize / 1000000).toFixed(2)}M / {stats.shieldedPool.chainSupply ? (stats.shieldedPool.chainSupply / 1000000).toFixed(1) : '\u2014'}M
                  </p>
                  <Link href="/pools" className="mt-2 inline-block text-[10px] font-mono text-cipher-cyan hover:underline">
                    Pool breakdown →
                  </Link>
                </CardBody>
              </Card>

              <Card variant="compact">
                <CardBody>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      stats.metrics.adoptionTrend === 'growing' ? 'bg-cipher-green/10 text-cipher-green' :
                      stats.metrics.adoptionTrend === 'declining' ? 'bg-red-500/10 text-danger' :
                      'bg-cipher-surface text-secondary'
                    }`}>
                      {trendIcon}
                    </div>
                    <h3 className="text-xs font-semibold text-secondary uppercase">Tx Adoption Trend</h3>
                  </div>
                  <div className={`text-2xl font-bold capitalize ${trendColor}`}>
                    {stats.metrics.adoptionTrend}
                  </div>
                  <p className="text-xs text-muted mt-1">7d shielded tx share</p>
                </CardBody>
              </Card>

              <Card variant="compact">
                <CardBody>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-cipher-green/10 flex items-center justify-center text-cipher-green">
                      <Icons.Eye />
                    </div>
                    <h3 className="text-xs font-semibold text-secondary uppercase">Fully Shielded</h3>
                  </div>
                  <div className="text-2xl font-bold text-primary">
                    {stats.totals.fullyShieldedTx.toLocaleString()}
                  </div>
                  <p className="text-xs text-muted mt-1">100% private</p>
                </CardBody>
              </Card>
            </div>
          </div>

          <div id="activity" className="scroll-mt-36">
          <Card className="flex flex-col h-full">
            <CardBody className="flex flex-col flex-1">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
                  <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">SHIELDED_ACTIVITY</h2>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-cipher-green rounded-full animate-pulse"></div>
                  <span className="text-xs font-mono text-muted uppercase tracking-wider">Live</span>
                </div>
              </div>
              <p className="text-xs text-secondary mb-4">
                Latest shielded transactions. Click to view or decrypt.
              </p>
              <div className="space-y-3 flex-1 overflow-y-auto max-h-[500px]">
                <RecentShieldedTxs nested limit={10} />
              </div>
              <Link href="/txs/shielded" className="block mt-3 text-center text-xs font-mono text-muted hover:text-cipher-cyan transition-colors">
                View All Shielded Transactions →
              </Link>
            </CardBody>
          </Card>
          </div>
        </div>

        <div className="mb-8 animate-fade-in-up stagger-3 max-w-2xl">
          {/* Transaction Types */}
          <Card>
            <CardBody>
              <div className="flex items-center gap-2 mb-5">
                <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
                <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">TX_TYPES</h2>
              </div>
              <div className="space-y-5">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-cipher-purple font-mono flex items-center gap-2 text-sm">
                      <Icons.Lock />
                      Shielded ({stats.totals.shieldedTx.toLocaleString()})
                    </span>
                    <Badge color="purple">{stats.metrics.shieldedPercentage.toFixed(1)}%</Badge>
                  </div>
                  <div className="h-3 privacy-progress-bg rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cipher-purple transition-all duration-700"
                      style={{ width: `${stats.metrics.shieldedPercentage}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-secondary font-mono flex items-center gap-2 text-sm">
                      <Icons.Eye />
                      Transparent ({stats.totals.transparentTx.toLocaleString()})
                    </span>
                    <Badge color="muted">{(100 - stats.metrics.shieldedPercentage).toFixed(1)}%</Badge>
                  </div>
                  <div className="h-3 privacy-progress-bg rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gray-500 transition-all duration-700"
                      style={{ width: `${100 - stats.metrics.shieldedPercentage}%` }}
                    />
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Charts Section with Tabs */}
        {stats.trends.daily.length > 0 && (
          <div id="trends" className="scroll-mt-36 mb-8 animate-fade-in-up stagger-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
              <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">HISTORICAL_TRENDS</h2>
            </div>
            <Card>
              <CardBody>
              {/* Pill Tabs */}
              <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
                {([
                  { key: 'adoption', label: 'Tx Adoption' },
                  { key: 'activity', label: 'Daily Activity' },
                  { key: 'score', label: 'Privacy Score' },
                ] as const).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-4 py-1.5 text-xs font-mono font-semibold rounded-full transition-all whitespace-nowrap ${
                      activeTab === tab.key
                        ? 'bg-cipher-cyan/10 text-cipher-cyan border border-cipher-cyan/30'
                        : 'text-muted hover:text-secondary border border-transparent'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <p className="text-xs text-muted mb-4 leading-relaxed">
                {activeTab === 'adoption' && (
                  <>Share of non-coinbase transactions that touch Sapling or Orchard each day. This is <strong className="text-secondary font-normal">transaction volume</strong>, not ZEC in shielded pools — see Supply Shielded above.</>
                )}
                {activeTab === 'activity' && 'Raw count of shielded vs transparent transactions per day (coinbase excluded from transparent).'}
                {activeTab === 'score' && 'Privacy Score v2: 30-day usage & quality, supply depth, and 90-day turnstile reshield rate.'}
              </p>

              {/* Chart Content */}
              <div className="relative overflow-hidden rounded-lg">
                <ChartWatermark size="lg" />
                <div className="relative z-[1]">
              {activeTab === 'adoption' && (
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={[...stats.trends.daily].reverse()}>
                    <CartesianGrid strokeDasharray="2 6" stroke={chartColors.gridStroke} opacity={0.5} />
                    <XAxis
                      dataKey="date"
                      stroke={chartColors.axis}
                      tick={{ fill: chartColors.axis, fontSize: 11 }}
                      tickFormatter={formatDate}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      stroke={chartColors.axis}
                      tick={{ fill: chartColors.axis, fontSize: 12 }}
                      label={{ value: 'Shielded tx share %', angle: -90, position: 'insideLeft', fill: chartColors.axis, style: { fontSize: 11 } }}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: chartColors.tooltipBg,
                        border: `1px solid ${chartColors.tooltipBorder}`,
                        borderRadius: '8px',
                        color: chartColors.tooltipText
                      }}
                      labelFormatter={(label) => formatDate(label)}
                      formatter={(value) => [
                        <span key="v" style={{ color: chartColors.tooltipText }}>{Number(value).toFixed(2)}%</span>,
                        'Shielded tx share'
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="shieldedPercentage"
                      stroke="var(--color-purple)"
                      strokeWidth={3}
                      dot={{ fill: 'var(--color-purple)', r: 3 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}


              {activeTab === 'activity' && (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={[...stats.trends.daily].reverse()}>
                    <CartesianGrid strokeDasharray="2 6" stroke={chartColors.gridStroke} opacity={0.5} />
                    <XAxis
                      dataKey="date"
                      stroke={chartColors.axis}
                      tick={{ fill: chartColors.axis, fontSize: 11 }}
                      tickFormatter={formatDate}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      stroke={chartColors.axis}
                      tick={{ fill: chartColors.axis, fontSize: 12 }}
                      label={{ value: 'Transactions', angle: -90, position: 'insideLeft', fill: chartColors.axis }}
                    />
                    <RechartsTooltip
                      cursor={{ fill: 'rgb(var(--color-purple-rgb) / 0.1)' }}
                      contentStyle={{
                        backgroundColor: chartColors.tooltipBg,
                        border: `1px solid ${chartColors.tooltipBorder}`,
                        borderRadius: '8px',
                        padding: '12px',
                        color: chartColors.tooltipText
                      }}
                      labelStyle={{ color: chartColors.tooltipText, fontWeight: 'bold', marginBottom: '8px' }}
                      labelFormatter={(label) => formatDate(label)}
                      formatter={(value, name) => {
                        const color = name === 'shielded' ? 'var(--color-purple)' : chartColors.axis;
                        const displayName = name === 'shielded' ? 'Shielded' : 'Transparent';
                        return [
                          <span key="v" style={{ color, fontWeight: '600' }}>
                            {Number(value).toLocaleString()} txs
                          </span>,
                          displayName
                        ];
                      }}
                    />
                    <Legend
                      wrapperStyle={{ color: chartColors.axis }}
                      formatter={(value) => {
                        const dotColor = value === 'shielded' ? 'var(--color-purple)' : '#6B7280';
                        return <span style={{ color: chartColors.tooltipText }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: dotColor, marginRight: 6 }} />{value === 'shielded' ? 'Shielded' : 'Transparent'}</span>;
                      }}
                    />
                    <Bar
                      dataKey="shielded"
                      fill="var(--color-purple)"
                      name="shielded"
                      radius={[4, 4, 0, 0]}
                      activeBar={{ fill: 'var(--color-purple-glow)' }}
                    />
                    <Bar
                      dataKey="transparent"
                      fill="#6B7280"
                      name="transparent"
                      radius={[4, 4, 0, 0]}
                      activeBar={{ fill: '#4B5563' }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}

              {activeTab === 'score' && (
                <div>
                  <div className="mb-4 text-sm text-secondary">
                    Privacy Score combines shielded adoption rate, pool growth, and transaction privacy to measure overall network privacy health (0-100).
                  </div>
                  <ResponsiveContainer width="100%" height={350}>
                    <AreaChart data={[...stats.trends.daily].reverse()}>
                      <defs>
                        <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-purple)" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="var(--color-purple)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="2 6" stroke={chartColors.gridStroke} opacity={0.5} />
                      <XAxis
                        dataKey="date"
                        stroke={chartColors.axis}
                        tick={{ fill: chartColors.axis, fontSize: 11 }}
                        tickFormatter={formatDate}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis
                        stroke={chartColors.axis}
                        tick={{ fill: chartColors.axis, fontSize: 12 }}
                        domain={[0, 100]}
                        label={{ value: 'Privacy Score', angle: -90, position: 'insideLeft', fill: chartColors.axis }}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: chartColors.tooltipBg,
                          border: `1px solid ${chartColors.tooltipBorder}`,
                          borderRadius: '8px',
                          color: chartColors.tooltipText,
                          padding: '12px'
                        }}
                        labelFormatter={(label) => formatDate(label)}
                        formatter={(value) => {
                          const score = Number(value);
                          let rating = 'Low';
                          let ratingColor = '#EF4444';
                          if (score >= 70) { rating = 'Excellent'; ratingColor = 'var(--color-green)'; }
                          else if (score >= 50) { rating = 'Good'; ratingColor = 'var(--color-yellow)'; }
                          else if (score >= 30) { rating = 'Fair'; ratingColor = 'var(--color-orange)'; }
                          return [
                            <span key="v" style={{ color: chartColors.tooltipText }}>
                              {score.toFixed(1)} / 100 (<span style={{ color: ratingColor }}>{rating}</span>)
                            </span>,
                            'Privacy Score'
                          ];
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="privacyScore"
                        stroke="var(--color-purple)"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorScore)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
                </div>
              </div>
              </CardBody>
            </Card>
          </div>
        )}

        <div id="distribution" className="scroll-mt-36 grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 animate-fade-in-up stagger-5">
          <AnonymitySetChart />
          <ShieldingDistributionChart />
        </div>

        <div className="mb-8 flex flex-wrap gap-x-4 gap-y-2 text-[11px] font-mono text-muted animate-fade-in-up stagger-6">
          <Link href="/pools" className="hover:text-cipher-cyan transition-colors">Shielded Pools →</Link>
          <Link href="/turnstile" className="hover:text-cipher-cyan transition-colors">Turnstile →</Link>
          <Link href="/tools/blend-check" className="hover:text-cipher-cyan transition-colors">Blend Check →</Link>
        </div>

        {/* Info Footer */}
        <div className="animate-fade-in-up stagger-6">
        <Card variant="glass">
          <CardBody>
            <h3 className="text-lg font-bold mb-4 text-primary">About Privacy Metrics</h3>
            <div className="space-y-3 text-sm text-secondary">
              <p>
                <strong className="text-primary">Privacy Score:</strong> A composite metric (0-100) from 30-day shielded tx usage,
                fully-shielded quality, supply depth, and turnstile reshield hygiene. See pool balances on <Link href="/pools" className="text-cipher-cyan hover:underline">Shielded Pools</Link>.
              </p>
              <p>
                <strong className="text-primary">Supply shielded:</strong> Share of {CURRENCY} supply in shielded pools — tracked in detail on the Pools page, not duplicated here.
              </p>
              <p>
                <strong className="text-primary">Tx Adoption chart:</strong> Daily percentage of non-coinbase transactions
                that include Sapling or Orchard. Distinct from <strong className="text-primary">Supply Shielded</strong>,
                which measures ZEC sitting in shielded pools.
              </p>
              <p>
                <strong className="text-primary">Tx Adoption Trend:</strong> Compares shielded tx share over the last 7 days
                vs the previous 7 days. Growing if +10%, declining if -10%, otherwise stable.
              </p>
              <p className="text-xs text-muted mt-4 pt-4 border-t border-cipher-border">
                Stats calculated from {stats.totals.blocks.toLocaleString()} blocks. Updates automatically every 10 blocks.
              </p>
            </div>
          </CardBody>
        </Card>
        </div>

    </div>
  );
}
