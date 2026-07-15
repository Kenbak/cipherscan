import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildPageMetadata, getAddressResolution, formatNumber, getBaseUrl } from '@/lib/seo';
import type { AddressMeta } from '@/lib/seo';
import { detectAddressType } from '@/lib/zcash';

type Props = {
  params: Promise<{ address: string }>;
  children: React.ReactNode;
};

function getAddressTypeLabel(addr: string, type: string): string {
  if (addr.startsWith('u1') || addr.startsWith('utest')) return 'Unified';
  if (addr.startsWith('zs') || addr.startsWith('ztestsapling')) return 'Sapling Shielded';
  if (type === 'shielded') return 'Shielded';
  return 'Transparent';
}

function isValidAddressSyntax(address: string): boolean {
  const type = detectAddressType(address);

  if (type === 'transparent') {
    return address.length === 35 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(address);
  }

  if (type === 'shielded') {
    return address.length === 78
      && /^(?:zs|ztestsapling)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/.test(address);
  }

  if (type === 'unified') {
    return address.length >= 16
      && address.length <= 512
      && /^(?:u|utest)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/.test(address);
  }

  return false;
}

function getAddressSummary(address: string, meta: AddressMeta | null): string {
  const detectedType = detectAddressType(address);
  const typeLabel = getAddressTypeLabel(address, meta?.type || detectedType);

  if (!meta) {
    return `${typeLabel} Zcash address lookup. Public activity details are temporarily unavailable.`;
  }

  if (meta.isShielded) {
    return `${typeLabel} Zcash address. Its balance and transaction history are private.`;
  }

  const transactionSummary = meta.txCount === 0
    ? 'no indexed transactions'
    : `${formatNumber(meta.txCount)} indexed transaction${meta.txCount === 1 ? '' : 's'}`;

  return `${typeLabel} Zcash address with a public balance of ${meta.balance.toFixed(4)} ZEC and ${transactionSummary}.`;
}

function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  if (!isValidAddressSyntax(address)) notFound();

  const resolution = await getAddressResolution(address);
  const path = `/address/${encodeURIComponent(address)}`;

  const shortAddr = address.length > 20
    ? `${address.slice(0, 10)}...${address.slice(-8)}`
    : address;

  if (resolution.state === 'absent') notFound();

  if (resolution.state === 'unavailable') {
    return buildPageMetadata({
      title: `Zcash Address ${shortAddr} | CipherScan`,
      description: `CipherScan cannot currently verify public activity for Zcash address ${shortAddr} because the address index is temporarily unavailable.`,
      path,
      index: false,
    });
  }

  const meta = resolution.meta;

  const typeLabel = getAddressTypeLabel(address, meta.type);
  const title = `Zcash Address ${shortAddr} | CipherScan`;

  const descParts = [`${typeLabel} Zcash address.`];
  if (!meta.isShielded) {
    descParts.push(`Balance: ${meta.balance.toFixed(4)} ZEC.`);
    if (meta.txCount > 0) {
      descParts.push(`${formatNumber(meta.txCount)} transaction${meta.txCount !== 1 ? 's' : ''}.`);
    }
  } else {
    descParts.push('Balance and transaction history are encrypted with zero-knowledge proofs.');
  }
  descParts.push('View on CipherScan.');

  const description = descParts.join(' ');

  const hasPublicActivity = meta.txCount > 0 || (!meta.isShielded && meta.balance > 0);

  return buildPageMetadata({
    title,
    description,
    path,
    index: hasPublicActivity,
    imageAlt: `${typeLabel} Zcash address ${shortAddr}`,
  });
}

export default async function AddressLayout({
  params,
  children,
}: Props) {
  const { address } = await params;
  if (!isValidAddressSyntax(address)) notFound();

  const resolution = await getAddressResolution(address);
  if (resolution.state === 'absent') notFound();
  const meta = resolution.state === 'found' ? resolution.meta : null;
  const path = `/address/${encodeURIComponent(address)}`;
  const canonical = new URL(path, `${getBaseUrl()}/`).toString();
  const summary = getAddressSummary(address, meta);
  const typeLabel = getAddressTypeLabel(address, meta?.type || detectAddressType(address));
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${canonical}#webpage`,
    url: canonical,
    name: `${typeLabel} Zcash address ${address}`,
    description: summary,
    isPartOf: { '@id': `${getBaseUrl()}/#website` },
    mainEntity: {
      '@type': 'Thing',
      '@id': `${canonical}#address`,
      name: `${typeLabel} Zcash address`,
      identifier: address,
      description: summary,
      url: canonical,
    },
  };

  return (
    <>
      <header className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-12">
        <span className="text-[10px] font-mono text-muted tracking-wider">&gt; ZCASH_ADDRESS</span>
        <h1 className="mt-2 text-primary break-all">
          <span className="block text-lg sm:text-xl font-semibold">Zcash Address</span>
          <span className="block mt-2 text-sm sm:text-base font-mono font-normal">{address}</span>
        </h1>
        <p className="mt-2 text-sm text-secondary">{summary}</p>
      </header>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      {children}
    </>
  );
}
