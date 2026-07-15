import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { buildPageMetadata, getBaseUrl } from '@/lib/seo';
import { getClient, isValidName } from '@/lib/zns';
import type { Registration } from 'zcashname-sdk';

type NameResolution =
  | { state: 'registered'; registration: Registration }
  | { state: 'available' }
  | { state: 'error' };

const resolveName = cache(async (name: string): Promise<NameResolution> => {
  try {
    const registration = await getClient().resolveName(name);
    return registration
      ? { state: 'registered', registration }
      : { state: 'available' };
  } catch (error) {
    console.error('Error resolving Zcash Name:', error);
    return { state: 'error' };
  }
});

function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function normalizeName(raw: string): string {
  try {
    return decodeURIComponent(raw).toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<Metadata> {
  const { name: raw } = await params;
  const name = normalizeName(raw);
  const path = `/name/${encodeURIComponent(name)}`;

  if (!isValidName(name)) {
    notFound();
  }

  const resolution = await resolveName(name);
  if (resolution.state === 'error') {
    return buildPageMetadata({
      title: `${name} Zcash Name | CipherScan`,
      description: `Look up the Zcash Name ${name} on CipherScan. Registration details are temporarily unavailable.`,
      path,
      index: false,
    });
  }

  if (resolution.state === 'available') {
    return buildPageMetadata({
      title: `${name} Is Available | Zcash Names | CipherScan`,
      description: `${name} is currently available as a Zcash Name. View claim pricing and registration details on CipherScan.`,
      path,
      index: false,
    });
  }

  const { registration } = resolution;
  const shortAddress = registration.address.length > 20
    ? `${registration.address.slice(0, 10)}...${registration.address.slice(-8)}`
    : registration.address;

  return buildPageMetadata({
    title: `${name} Zcash Name | CipherScan`,
    description: `${name} is a registered Zcash Name resolving to ${shortAddress}. View its status and registration history on CipherScan.`,
    path,
    networks: ['mainnet'],
    imageAlt: `${name} registered Zcash Name`,
  });
}

export default async function NameLayout({
  params,
  children,
}: {
  params: Promise<{ name: string }>;
  children: React.ReactNode;
}) {
  const { name: raw } = await params;
  const name = normalizeName(raw);
  if (!isValidName(name)) notFound();

  const resolution = await resolveName(name);
  const path = `/name/${encodeURIComponent(name)}`;
  const canonical = new URL(path, `${getBaseUrl()}/`).toString();
  const summary = resolution.state === 'registered'
    ? `${name} is a registered Zcash Name resolving to ${resolution.registration.address}.`
    : resolution.state === 'available'
      ? `${name} is currently available as a Zcash Name.`
      : `Registration details for the Zcash Name ${name} are temporarily unavailable.`;
  const jsonLd = resolution.state === 'error'
    ? null
    : {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        '@id': `${canonical}#webpage`,
        url: canonical,
        name: `${name} Zcash Name`,
        description: summary,
        isPartOf: { '@id': `${getBaseUrl()}/#website` },
        mainEntity: {
          '@type': 'Thing',
          '@id': `${canonical}#zcash-name`,
          name,
          identifier: name,
          description: summary,
          url: canonical,
        },
      };

  return (
    <>
      <header className="container mx-auto px-4 pt-8 max-w-4xl">
        <span className="text-[10px] font-mono text-muted tracking-wider">&gt; ZCASH_NAME</span>
        <h1 className="mt-2 text-primary break-all">
          <span className="block text-3xl font-mono">{name}</span>
          <span className="block mt-1 text-sm font-normal">Zcash Name</span>
        </h1>
        <p className="mt-2 text-sm text-secondary break-words">{summary}</p>
      </header>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      )}
      {children}
    </>
  );
}
