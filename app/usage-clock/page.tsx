import { UsageClockClient } from './UsageClockClient';
import { getApiUrl } from '@/lib/api-config';

const API_BASE = getApiUrl();

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
