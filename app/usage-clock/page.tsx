import { UsageClockClient } from './UsageClockClient';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.mainnet.cipherscan.app';

async function fetchClock(period: string) {
  try {
    const res = await fetch(`${API_BASE}/api/analytics/usage-clock?period=${period}`, {
      next: { revalidate: 1800 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchNodes() {
  try {
    const res = await fetch(`${API_BASE}/api/network/nodes`, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function UsageClockPage() {
  const [clock, nodes] = await Promise.all([fetchClock('1y'), fetchNodes()]);
  return (
    <UsageClockClient
      initialData={clock}
      initialPeriod="1y"
      initialNodes={nodes?.locations || []}
    />
  );
}
