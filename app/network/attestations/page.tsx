import { readApiData } from '@/lib/api-client';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/SectionHeader';
import { buildPageMetadata, getApiUrl, getBaseUrl, getNetwork } from '@/lib/seo';
import { fetchWithDeadline } from '@/lib/server-fetch';
import { normalizeApiBaseUrl } from '@/lib/network';
import type { AttestationData } from '@/lib/attestations';
import AttestationsClient from './AttestationsClient';

// No ISR snapshot may outlive a security observation's freshness window.
export const dynamic = 'force-dynamic';
export const metadata = buildPageMetadata({
  title: 'Zero Indexer Attestation Monitor | ZecBlock',
  description: 'Check fresh enclave evidence, TLS certificate bindings and software release status for experimental Zcash Zero Indexer shims and hubs.',
  path: '/network/attestations', index: true, networks: ['mainnet', 'testnet'],
  imageAlt: 'ZecBlock Zero Indexer attestation monitor',
});

export default async function AttestationsPage() {
  const network = getNetwork();
  if (network === 'crosslink-testnet') notFound();
  let initialData: AttestationData | null = null;
  try {
    const response = await fetchWithDeadline(`${getApiUrl()}/v1/network/attestations`, { cache: 'no-store' });
    if (response.ok) {
      const data = await readApiData<AttestationData>(response);
      if (data.network === network && Array.isArray(data.endpoints)) initialData = data;
    }
  } catch { /* The introduction and explicit unavailable state still render on an API outage. */ }
  const publicApiUrl = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL || (network === 'mainnet' ? 'https://api.zecblock.com' : 'https://api.testnet.cipherscan.app'));
  const initialNow = Date.now();
  const url = `${getBaseUrl()}/network/attestations`;
  const schema = {
    '@context': 'https://schema.org', '@type': 'WebPage', '@id': `${url}#webpage`, url,
    name: 'Zero Indexer Attestation Monitor',
    description: 'Observed enclave evidence and TLS certificate bindings for experimental Zero Indexer endpoints. Software release verification is shown separately.',
    isPartOf: { '@id': `${getBaseUrl()}/#website` },
    publisher: { '@id': 'https://zecblock.com/#organization' },
  };
  return <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }} />
    <Link href="/network" className="inline-block text-sm text-muted hover:text-cipher-gold mb-6">← Network overview</Link>
    <PageHeader eyebrow="NETWORK_ATTESTATIONS" title="Zero Indexer attestations"
      subtitle="Independent observations of the experimental shims and hubs serving Zcash wallets. Check their enclave evidence, connection certificates and software release status."
      actions={<span className="font-mono text-xs px-3 py-1.5 rounded-full border border-cipher-border text-secondary">{network === 'mainnet' ? 'MAINNET' : 'TESTNET'} · EXPERIMENTAL</span>} />
    <AttestationsClient initialData={initialData} initialNow={initialNow} network={network} apiUrl={publicApiUrl} />
    <section className="mt-12 border-t border-cipher-border pt-8" aria-labelledby="attestation-method">
      <h2 id="attestation-method" className="text-lg font-semibold text-primary mb-4">What these checks tell you</h2>
      <div className="grid gap-6 md:grid-cols-3 text-sm text-secondary leading-relaxed">
        <div><h3 className="font-medium text-primary mb-2">01 · Fresh enclave evidence</h3><p>Each check sends a new random challenge. We validate the signed response against the AWS Nitro trust root, check its timestamp and reject debug measurements.</p></div>
        <div><h3 className="font-medium text-primary mb-2">02 · A matching connection</h3><p>The domain and certificate fingerprint inside the signed evidence must match the HTTPS connection used by our observer.</p></div>
        <div><h3 className="font-medium text-primary mb-2">03 · A separate software check</h3><p>Release verification needs independently established build measurements. Valid evidence alone does not confirm the expected software or prove that the software is safe.</p></div>
      </div>
      <p className="text-sm text-muted mt-6 max-w-4xl">These are periodic observations from ZecBlock, not verification of your wallet’s connection. A passing shim does not establish its hub’s status. The monitor does not measure transaction privacy, batching or wallet service uptime.</p>
      <div className="flex flex-wrap gap-x-6 gap-y-3 mt-5 text-sm">
        <a className="text-cipher-gold hover:underline" href="https://docs.caution.co/concepts/attestation/" target="_blank" rel="noopener noreferrer">Attestation methodology ↗</a>
        <a className="text-cipher-gold hover:underline" href="https://docs.caution.co/guides/verify-an-app/" target="_blank" rel="noopener noreferrer">Verify a build yourself ↗</a>
        <a className="text-cipher-gold hover:underline" href={`${publicApiUrl}/v1/network/attestations`}>Public JSON API ↗</a>
      </div>
    </section>
  </div>;
}
