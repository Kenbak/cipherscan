import TxDetailClient from './components/TxDetailClient';

type PageProps = {
  params: Promise<{ txid: string }>;
};

/**
 * Transaction detail page shell. SEO metadata, JSON-LD, and the server-rendered
 * H1 live in layout.tsx. Client-side fetching and interactive UI live in
 * TxDetailClient so the page can stay a thin server component.
 */
export default async function TransactionPage({ params }: PageProps) {
  const { txid } = await params;
  const normalizedTxid = txid.toLowerCase();

  return <TxDetailClient txid={normalizedTxid} />;
}
