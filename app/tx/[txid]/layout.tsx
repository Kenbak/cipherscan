import type { Metadata } from 'next';
import { getTxMeta, getBaseUrl, truncateHash, formatNumber } from '@/lib/seo';

type Props = {
  params: Promise<{ txid: string }>;
  children: React.ReactNode;
};

function getTxType(meta: { isCoinbase: boolean; hasShielded: boolean; orchardActions: number }): string {
  if (meta.isCoinbase) return 'Coinbase';
  if (meta.orchardActions > 0 && !meta.hasShielded) return 'Orchard Shielded';
  if (meta.hasShielded) return 'Shielded';
  return 'Transparent';
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { txid } = await params;
  const tx = await getTxMeta(txid);
  const baseUrl = getBaseUrl();

  if (!tx) {
    return {
      title: `Transaction ${truncateHash(txid)} | CipherScan`,
      description: `View Zcash transaction ${truncateHash(txid)} on CipherScan — the Zcash blockchain explorer.`,
    };
  }

  const txType = getTxType(tx);
  const title = `Transaction ${truncateHash(tx.txid)} | CipherScan — Zcash Explorer`;
  const description = `${txType} Zcash transaction in block #${formatNumber(tx.blockHeight)} with ${formatNumber(tx.confirmations)} confirmation${tx.confirmations !== 1 ? 's' : ''}. ${tx.shieldedSpends + tx.shieldedOutputs + tx.orchardActions > 0 ? 'Includes shielded (private) components.' : 'Transparent transaction.'} View details on CipherScan.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${baseUrl}/tx/${txid}`,
      siteName: 'CipherScan',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
    alternates: {
      canonical: `${baseUrl}/tx/${txid}`,
    },
  };
}

export default function TxLayout({ children }: { children: React.ReactNode }) {
  return children;
}
