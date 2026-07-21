import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import {
  buildPageMetadata,
  getApiUrl,
  getBaseUrl,
  getNetwork,
  getTxResolution,
  truncateHash,
  formatNumber,
  type TxMeta,
} from '@/lib/seo';
import { fetchWithDeadline } from '@/lib/server-fetch';

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

type TransactionStatus = 'Confirmed' | 'Pending' | 'Reorganized' | 'Unknown';

type AlternateHashResolution = 'block' | 'finalizer' | 'absent' | 'unavailable';

const resolveAlternateHash = cache(async (hash: string): Promise<AlternateHashResolution> => {
  try {
    const blockResponse = await fetchWithDeadline(`${getApiUrl()}/api/block/${hash}?summary=1`, {
      next: { revalidate: 30 },
    });
    if (blockResponse.ok) return 'block';
    if (blockResponse.status !== 404 && blockResponse.status !== 410) return 'unavailable';

    if (getNetwork() !== 'crosslink-testnet') return 'absent';

    const finalizerResponse = await fetchWithDeadline(`${getApiUrl()}/api/finalizer/${hash}`, {
      next: { revalidate: 30 },
    });
    if (finalizerResponse.ok) return 'finalizer';
    if (finalizerResponse.status === 404 || finalizerResponse.status === 410) return 'absent';
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
});

function getTransactionStatus(meta: TxMeta | null): TransactionStatus {
  if (!meta) return 'Unknown';
  if (meta.status === 'confirmed') return 'Confirmed';
  if (meta.status === 'pending') return 'Pending';
  if (meta.status === 'stale') return 'Reorganized';
  return 'Unknown';
}

function getStatusDescription(status: TransactionStatus, meta: TxMeta | null): string {
  if (status === 'Confirmed' && meta) {
    return `Included in canonical Zcash block #${formatNumber(meta.blockHeight)} with ${formatNumber(meta.confirmations)} confirmation${meta.confirmations === 1 ? '' : 's'}.`;
  }

  if (status === 'Pending') {
    return 'Waiting in the Zcash mempool with 0 confirmations. This page updates after the transaction is mined.';
  }

  if (status === 'Reorganized' && meta) {
    return `Previously recorded in block #${formatNumber(meta.blockHeight)}, but that block is no longer on the canonical chain.`;
  }

  return 'CipherScan cannot currently verify this transaction state. The transaction may be unindexed, absent, or temporarily unavailable from the data service.';
}

function getNetworkName(): string {
  const network = getNetwork();
  if (network === 'mainnet') return 'Zcash mainnet';
  if (network === 'testnet') return 'Zcash testnet (TAZ)';
  return 'Zcash Crosslink testnet';
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { txid } = await params;
  const normalizedTxid = txid.toLowerCase();
  const path = `/tx/${normalizedTxid}`;

  if (!/^[a-fA-F0-9]{64}$/.test(txid)) {
    return buildPageMetadata({
      title: 'Invalid Zcash Transaction | CipherScan',
      description: 'This transaction identifier is not a valid 64-character Zcash transaction hash.',
      path,
      index: false,
      canonical: false,
    });
  }

  const resolution = await getTxResolution(normalizedTxid);

  if (resolution.state !== 'found') {
    const isAbsent = resolution.state === 'absent';
    return buildPageMetadata({
      title: isAbsent
        ? `Zcash Transaction ${truncateHash(normalizedTxid)} Not Found | CipherScan`
        : `Zcash Transaction ${truncateHash(normalizedTxid)} Status Unknown | CipherScan`,
      description: isAbsent
        ? `CipherScan could not find Zcash transaction ${truncateHash(normalizedTxid)} in the confirmed index or mempool.`
        : `CipherScan cannot currently verify the status of Zcash transaction ${truncateHash(normalizedTxid)} because a required data service is temporarily unavailable.`,
      path,
      index: false,
      canonical: !isAbsent,
    });
  }

  const tx = resolution.meta;

  const txType = getTxType(tx);
  const status = getTransactionStatus(tx);
  const isPending = status === 'Pending';
  const isConfirmed = status === 'Confirmed';
  const title = isPending
    ? `Pending Zcash Transaction ${truncateHash(tx.txid)} | CipherScan`
    : isConfirmed
      ? `Zcash Transaction ${truncateHash(tx.txid)} | CipherScan`
      : status === 'Reorganized'
        ? `Reorganized Zcash Transaction ${truncateHash(tx.txid)} | CipherScan`
        : `Zcash Transaction ${truncateHash(tx.txid)} Status Unknown | CipherScan`;
  const description = isPending
    ? `${txType} Zcash transaction currently pending in the mempool with 0 confirmations. This page updates when the transaction is mined.`
    : isConfirmed
      ? `${txType} Zcash transaction in block #${formatNumber(tx.blockHeight)} with ${formatNumber(tx.confirmations)} confirmation${tx.confirmations !== 1 ? 's' : ''}. ${tx.shieldedSpends + tx.shieldedOutputs + tx.orchardActions > 0 ? 'Includes shielded components.' : 'Transparent transaction.'}`
      : status === 'Reorganized'
        ? `This Zcash transaction is no longer verified in its recorded block after a chain reorganization. CipherScan will update this page if it returns to the mempool or confirms again.`
        : `CipherScan has a record for this Zcash transaction but cannot currently verify its canonical-chain status.`;

  return buildPageMetadata({
    title,
    description,
    path,
    index: isPending || isConfirmed,
    imageAlt: `${status} Zcash transaction ${truncateHash(tx.txid)}`,
  });
}

export default async function TxLayout({ params, children }: Props) {
  const { txid } = await params;

  // The syntax check is authoritative. A valid-looking hash is not treated as
  // absent here because API and mempool failures are intentionally represented
  // as an unknown state, and the client may still redirect block/finalizer IDs.
  if (!/^[a-fA-F0-9]{64}$/.test(txid)) {
    notFound();
  }

  const normalizedTxid = txid.toLowerCase();
  const resolution = await getTxResolution(normalizedTxid);

  if (resolution.state === 'absent') {
    const alternate = await resolveAlternateHash(normalizedTxid);
    if (alternate === 'block') redirect(`/block/${normalizedTxid}`);
    if (alternate === 'finalizer') redirect(`/finalizer/${normalizedTxid}`);
    if (alternate === 'absent') notFound();
  }

  const tx = resolution.state === 'found' ? resolution.meta : null;
  const status = getTransactionStatus(tx);
  const statusDescription = getStatusDescription(status, tx);
  const networkName = getNetworkName();
  const baseUrl = getBaseUrl();
  const canonicalUrl = `${baseUrl}/tx/${normalizedTxid}`;
  const txType = tx ? getTxType(tx) : null;

  const variableMeasured: Array<Record<string, string | number>> = [
    {
      '@type': 'PropertyValue',
      name: 'Network',
      value: networkName,
    },
    {
      '@type': 'PropertyValue',
      name: 'Transaction status',
      value: status,
    },
  ];

  if (txType) {
    variableMeasured.push({
      '@type': 'PropertyValue',
      name: 'Transaction type',
      value: txType,
    });
  }

  if (tx && tx.blockHeight > 0 && status !== 'Pending') {
    variableMeasured.push({
      '@type': 'PropertyValue',
      name: status === 'Reorganized' ? 'Recorded block height' : 'Block height',
      value: tx.blockHeight,
    });
  }

  if (status === 'Confirmed' || status === 'Pending') {
    variableMeasured.push({
      '@type': 'PropertyValue',
      name: 'Confirmations',
      value: tx?.confirmations ?? 0,
    });
  }

  const transactionJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${canonicalUrl}#webpage`,
    url: canonicalUrl,
    name: `Zcash transaction ${normalizedTxid}`,
    description: statusDescription,
    isPartOf: { '@id': `${baseUrl}/#website` },
    mainEntity: {
      '@type': 'Dataset',
      '@id': `${canonicalUrl}#transaction`,
      name: `Zcash transaction ${normalizedTxid}`,
      url: canonicalUrl,
      description: statusDescription,
      creator: { '@id': 'https://cipherscan.app/#organization' },
      isPartOf: { '@id': `${baseUrl}/#website` },
      identifier: {
        '@type': 'PropertyValue',
        propertyID: 'Zcash transaction ID',
        value: normalizedTxid,
      },
      variableMeasured,
    },
  };

  const statusClass = status === 'Confirmed'
    ? 'text-cipher-green border-cipher-green/30 bg-cipher-green/5'
    : status === 'Pending'
      ? 'text-cipher-yellow border-cipher-yellow/30 bg-cipher-yellow/5'
      : status === 'Reorganized'
        ? 'text-warning border-warning/30 bg-warning/5'
        : 'text-muted border-cipher-border bg-glass-2';

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(transactionJsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <section
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-12"
        aria-labelledby="transaction-heading"
      >
        <p className="text-xs font-mono text-muted tracking-wider">&gt; ZCASH_TRANSACTION</p>
        <h1 id="transaction-heading" className="mt-2">
          <span className="block text-lg sm:text-xl font-semibold tracking-tight text-primary">
            Zcash Transaction
          </span>
          <span className="block mt-2 text-sm sm:text-base font-mono font-normal text-primary break-all">
            {normalizedTxid}
          </span>
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-mono font-medium uppercase tracking-wide ${statusClass}`}>
            {status}
          </span>
          <span className="text-xs font-mono text-muted">{networkName}</span>
          {txType && <span className="text-xs font-mono text-muted">{txType}</span>}
        </div>
        <p className="sr-only">{statusDescription}</p>
      </section>
      {children}
    </>
  );
}
