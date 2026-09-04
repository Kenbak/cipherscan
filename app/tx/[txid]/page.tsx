import { getTxResolution } from '@/lib/seo';
import TxDetailClient from './components/TxDetailClient';

type PageProps = {
  params: Promise<{ txid: string }>;
};

/**
 * Transaction detail page shell. SEO metadata, JSON-LD, and the server-rendered
 * H1 live in layout.tsx. Client-side fetching and interactive UI live in
 * TxDetailClient so the page can stay a thin server component.
 *
 * `getTxResolution` is wrapped in React's `cache()`, so calling it again
 * here (layout.tsx already called it for metadata/JSON-LD) reuses that
 * same in-request result instead of firing a second fetch. The resolved
 * `TxMeta` is threaded down as `initialMeta` so the client's loading state
 * can render real status/type/block-height content immediately instead of
 * a pure shimmer skeleton — server-seeded initial content, not a second
 * data source.
 */
export default async function TransactionPage({ params }: PageProps) {
  const { txid } = await params;
  const normalizedTxid = txid.toLowerCase();
  const resolution = await getTxResolution(normalizedTxid);
  const initialMeta = resolution.state === 'found' ? resolution.meta : null;

  return <TxDetailClient txid={normalizedTxid} initialMeta={initialMeta} />;
}
