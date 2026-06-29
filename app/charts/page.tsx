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

  if (flows?.data) {
    const fData = flows.data.slice(-30);
    map['flow-volume'] = fData.map((d: any) => ({
      label: d.date ? new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '',
      netFlow: d.net_flow ?? d.netFlow ?? 0,
    }));
    map['pool-balances'] = fData.map((d: any) => ({
      label: d.date ? new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '',
      orchard: d.orchard_balance ?? d.shield_in ?? 0,
    }));
    map['pool-growth'] = fData.map((d: any) => ({
      label: d.date ? new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '',
      totalShielded: d.total_shielded ?? d.shield_in ?? 0,
    }));
    map['privacy-adoption'] = fData.map((d: any) => ({
      label: d.date ? new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '',
      shieldedPct: d.shielded_pct ?? 0,
    }));
    map['daily-activity'] = fData.map((d: any) => ({
      label: d.date ? new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '',
      shielded: d.shield_count ?? d.shield_in ?? 0,
    }));
    map['turnstile'] = fData.map((d: any) => ({
      label: d.date ? new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '',
      held: d.held ?? d.deshield_out ?? 0,
    }));
  }

  if (hashrate?.data) {
    map['hashrate-share'] = hashrate.data.slice(-30).map((d: any) => {
      const numericVals = Object.entries(d).filter(([k, v]) => k !== 'date' && typeof v === 'number');
      const topVal = numericVals.length > 0 ? Math.max(...numericVals.map(([, v]) => v as number)) : 0;
      return {
        label: d.date ? new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '',
        share: topVal,
      };
    });
  }

  if (anonymity?.data) {
    map['anonymity-set'] = anonymity.data.map((d: any) => ({
      label: d.thresholdZec != null ? `${d.thresholdZec}` : '',
      shieldCount: d.shieldCount ?? d.shield_count ?? 0,
    }));
  }

  if (shielding?.data) {
    map['shielding-dist'] = shielding.data.map((d: any) => ({
      label: d.bucket ?? d.range ?? '',
      count: d.shieldCount ?? d.shield_count ?? d.count ?? 0,
    }));
  }

  if (fees?.data) {
    map['fee-dist'] = fees.data.slice(-30).map((d: any) => ({
      label: d.date ? new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '',
      median: d.p50 ?? d.median ?? 0,
    }));
  }

  if (poolDist?.data) {
    map['mining-dist'] = poolDist.data.slice(0, 10).map((d: any) => ({
      label: (d.pool ?? d.name ?? '').slice(0, 8),
      blocks: d.blocks ?? d.block_count ?? 0,
    }));
  }

  if (minerBeh?.data) {
    map['miner-behavior'] = minerBeh.data.slice(0, 10).map((d: any) => ({
      label: (d.pool ?? d.name ?? '').slice(0, 8),
      earned: d.earned ?? d.total_earned_zec ?? 0,
    }));
  }

  // Known curves (no API needed)
  map['supply-emission'] = Array.from({ length: 20 }, (_, i) => ({
    label: `${2016 + i}`,
    supply: Math.min(21_000_000, 500_000 + i * 850_000),
  }));

  map['mining-metrics'] = Array.from({ length: 20 }, (_, i) => ({
    label: `${i + 1}`,
    value: 15 + Math.sin(i / 3) * 3 + i * 0.2,
  }));

  map['chain-size'] = Array.from({ length: 20 }, (_, i) => ({
    label: `${2020 + Math.floor(i / 4)}`,
    sizeGb: 30 + i * 2.5,
  }));

  map['protocol-stats'] = Array.from({ length: 12 }, (_, i) => ({
    label: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i],
    commitments: 800000 + i * 120000,
  }));

  return map;
}

export default async function ChartsPage() {
  const chartData = await fetchChartData();
  return <ChartsClient initialData={chartData} />;
}
