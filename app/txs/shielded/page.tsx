import { redirect } from 'next/navigation';

type SearchParams = Record<string, string | string[] | undefined>;

interface ShieldedRedirectProps {
  searchParams: Promise<SearchParams>;
}

/**
 * Permanent redirect from the legacy /txs/shielded route to the unified
 * /txs?type=shielded page. Preserves all query params (pool, flow_type,
 * min_zec, cursor, pagination).
 */
export default async function ShieldedTransactionsRedirect({
  searchParams,
}: ShieldedRedirectProps) {
  const params = await searchParams;
  const target = new URLSearchParams();
  target.set('type', 'shielded');

  for (const [key, value] of Object.entries(params)) {
    if (key === 'type') continue;
    const v = Array.isArray(value) ? value[0] : value;
    if (v !== undefined) target.set(key, v);
  }

  redirect(`/txs?${target.toString()}`);
}
