import { getGovernanceCatalog } from '@/lib/governance-data';
import { selectAnnouncement } from '@/lib/governance';
import { getNetwork } from '@/lib/seo';

export async function GET() {
  if (getNetwork() !== 'mainnet') return Response.json({ announcement: null }, { headers: { 'X-Robots-Tag': 'noindex' } });
  const catalog = await getGovernanceCatalog();
  return Response.json({ announcement: selectAnnouncement(catalog, Date.now()) }, { headers: {
    'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex',
  } });
}
