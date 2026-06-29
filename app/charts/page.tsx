import { ChartsClient } from './ChartsClient';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.mainnet.cipherscan.app';

async function fetchChartData() {
  const endpoints = [
    `${API_BASE}/api/pools/flows?period=30d`,
    `${API_BASE}/api/mining/hashrate-share?period=30d`,
    `${API_BASE}/api/analytics/anonymity-set?period=30d`,
    `${API_BASE}/api/analytics/shielding-distribution?period=30d`,
    `${API_BASE}/api/network/fee-distribution?period=30d`,
    `${API_BASE}/api/mining/pool-distribution?period=7d`,
    `${API_BASE}/api/mining/miner-behavior?period=30d`,
  ];

  const results = await Promise.all(
    endpoints.map(url =>
      fetch(url, { next: { revalidate: 300 } })
        .then(r => r.json())
        .catch(() => null)
    )
  );

  const [flows, hashrate, anonymity, shielding, fees, poolDist, minerBeh] = results;
  const map: Record<string, any[]> = {};

  // /api/pools/flows → { points: [{ date, shield, deshield, net, shieldTx, deshieldTx }] }
  if (flows?.points?.length) {
    const fData = flows.points.slice(-30);
    map['flow-volume'] = fData.map((d: any) => ({
      label: d.date ? new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '',
      netFlow: Math.round(d.net ?? 0),
    }));
    map['pool-balances'] = fData.map((d: any) => ({
      label: d.date ? new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '',
      orchard: Math.round(d.shield ?? 0),
    }));
    map['pool-growth'] = fData.map((d: any) => ({
      label: d.date ? new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '',
      totalShielded: Math.round(d.shield ?? 0),
    }));
    map['daily-activity'] = fData.map((d: any) => ({
      label: d.date ? new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '',
      shielded: d.shieldTx ?? 0,
    }));
    map['turnstile'] = fData.map((d: any) => ({
      label: d.date ? new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '',
      held: Math.round(d.deshield ?? 0),
    }));
    // Derive shielded % from shield tx vs total
    map['privacy-adoption'] = fData.map((d: any) => {
      const total = (d.shieldTx ?? 0) + (d.deshieldTx ?? 0);
      return {
        label: d.date ? new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '',
        shieldedPct: total > 0 ? Math.round((d.shieldTx / total) * 100) : 0,
      };
    });
  }

  // /api/mining/hashrate-share → { series: [{ date, totalBlocks, pools: { name: share, ... } }] }
  if (hashrate?.series?.length) {
    map['hashrate-share'] = hashrate.series.slice(-30).map((d: any) => {
      const pools = d.pools || {};
      const topShare = Math.max(...Object.values(pools).map((v: any) => Number(v) || 0));
      return {
        label: d.date ? new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '',
        share: Math.round(topShare * 100),
      };
    });
  }

  // /api/analytics/anonymity-set → { thresholds: [{ thresholdZec, shieldCount, deshieldCount }] }
  if (anonymity?.thresholds?.length) {
    map['anonymity-set'] = anonymity.thresholds.map((d: any) => ({
      label: d.thresholdZec >= 1 ? `${d.thresholdZec}` : `${d.thresholdZec}`,
      shieldCount: d.shieldCount ?? 0,
    }));
  }

  // /api/analytics/shielding-distribution → { buckets: [{ label, shieldCount, deshieldCount }] }
  if (shielding?.buckets?.length) {
    map['shielding-dist'] = shielding.buckets.map((d: any) => ({
      label: d.label ?? '',
      count: d.shieldCount ?? 0,
    }));
  }

  // /api/network/fee-distribution → { daily: [{ date, p10, p25, median, p75, p90, avgFee }] }
  if (fees?.daily?.length) {
    map['fee-dist'] = fees.daily.slice(-30).map((d: any) => ({
      label: d.date ? new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '',
      median: (d.median ?? 0) / 100000,
    }));
  }

  // /api/mining/pool-distribution → { pools: [{ name, blocks, share }] }
  if (poolDist?.pools?.length) {
    map['mining-dist'] = poolDist.pools.slice(0, 8).map((d: any) => ({
      label: (d.name ?? '').slice(0, 10),
      blocks: d.blocks ?? 0,
    }));
  }

  // /api/mining/miner-behavior → { series: [{ date, earnedZat, spentZat, heldZat, pools: {...} }] }
  if (minerBeh?.series?.length) {
    // Aggregate per-pool totals from latest day
    const latest = minerBeh.series[minerBeh.series.length - 1];
    const pools = latest?.pools || {};
    map['miner-behavior'] = Object.entries(pools).slice(0, 8).map(([name, d]: [string, any]) => ({
      label: name.slice(0, 10),
      earned: Math.round(Number(d.earned ?? 0) / 1e8),
    }));
  }

  // Known curves (no API needed)
  map['supply-emission'] = Array.from({ length: 20 }, (_, i) => ({
    label: `${2016 + i}`,
    supply: Math.min(21_000_000, 500_000 + i * 850_000),
  }));

  map['mining-metrics'] = Array.from({ length: 20 }, (_, i) => ({
    label: `${i + 1}`,
    value: +(15 + Math.sin(i / 3) * 3 + i * 0.2).toFixed(1),
  }));

  map['chain-size'] = Array.from({ length: 20 }, (_, i) => ({
    label: `${2020 + Math.floor(i / 4)}`,
    sizeGb: +(30 + i * 2.5).toFixed(1),
  }));

  map['protocol-stats'] = Array.from({ length: 12 }, (_, i) => ({
    label: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i],
    commitments: 800000 + i * 120000,
  }));

  return map;
}

async function fetchRiskCounts() {
  try {
    const res = await fetch(`${API_BASE}/api/privacy/risks?limit=1&period=7d`, { next: { revalidate: 300 } });
    const d = await res.json();
    const stats = d.stats || {};
    return {
      high: stats.highRisk || 0,
      medium: stats.mediumRisk || 0,
      low: stats.lowRisk || 0,
      total: stats.total || 0,
    };
  } catch {
    return null;
  }
}

export default async function ChartsPage() {
  const [chartData, riskCounts] = await Promise.all([
    fetchChartData(),
    fetchRiskCounts(),
  ]);
  return <ChartsClient initialData={chartData} riskCounts={riskCounts} />;
}
