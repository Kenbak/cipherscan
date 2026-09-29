import Link from 'next/link';
import { buildPageMetadata, getBaseUrl } from '@/lib/seo';
import { PageHeader } from '@/components/ui/SectionHeader';

export const metadata = buildPageMetadata({
  title: 'Terms of Service | ZecBlock',
  description: 'Review the terms for using ZecBlock\'s Zcash explorer, APIs, privacy tools, and blockchain data, including availability and liability limits.',
  path: '/terms',
  networks: ['mainnet'],
});

export default function TermsPage() {
  const updated = 'September 29, 2026';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org', '@type': 'WebPage',
        '@id': `${getBaseUrl()}/terms#webpage`, url: `${getBaseUrl()}/terms`,
        name: 'Terms of Service', isPartOf: { '@id': `${getBaseUrl()}/#website` },
        publisher: { '@id': 'https://zecblock.com/#organization' },
      }) }} />
      <PageHeader
        eyebrow="LEGAL"
        title="Terms of Service"
        subtitle={<span className="font-mono">Last updated: {updated}</span>}
      />

      <div className="prose-legal space-y-8 text-sm text-secondary leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-primary mb-3">1. Acceptance</h2>
          <p>
            By accessing or using ZecBlock (<Link href="/" className="legal-link">zecblock.com</Link>),
            you agree to these Terms of Service. If you do not agree, do not use the service. Our <Link href="/privacy-policy" className="legal-link">Privacy Policy</Link> explains how information is processed.
            ZecBlock is operated by Atmosphere Labs (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-primary mb-3">2. Description of Service</h2>
          <p>
            ZecBlock is a free, open-source Zcash blockchain explorer. We provide tools to browse
            publicly available blockchain data, decode transactions, check privacy metrics, swap
            cryptocurrency, view charts and anomaly signals, use Ask, and access developer APIs. The service is provided &ldquo;as is&rdquo; without warranty.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-primary mb-3">3. No Financial Advice</h2>
          <p>
            Nothing on ZecBlock constitutes financial, investment, legal, or tax advice. Blockchain data,
            price information, and swap quotes are provided for informational purposes only. You are solely
            responsible for your financial decisions. Statistical alerts and transfers to labeled services do not establish fair value, a sale, intent, ownership or wallet identity. Ask can make mistakes; verify its sources before relying on an answer.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-primary mb-3">4. Swap &amp; On-Ramp Services</h2>
          <p className="mb-3">
            ZecBlock integrates third-party services to facilitate cross-chain swaps and fiat-to-crypto
            purchases. When using these features:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Swaps are executed by <strong className="text-primary">NEAR Intents</strong>. We act as an interface only and do not custody, control, or guarantee any swap transaction.</li>
            <li>Fiat purchases are processed by third-party providers (e.g. MoonPay). You interact directly with these providers, who may require identity verification and are subject to their own terms.</li>
            <li>Cryptocurrency transactions are irreversible. Double-check all addresses and amounts before confirming.</li>
            <li>We are not responsible for failed, delayed, or incorrect swaps. If a swap fails, refunds are handled by the swap provider to your specified refund address.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-primary mb-3">5. User Responsibilities</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>You are responsible for the security of your wallet, private keys, and viewing keys. Only enter viewing keys in the dedicated browser-side decryption tools. Never submit private keys, recovery phrases or other secrets to Ask or support.</li>
            <li>You must comply with all applicable laws in your jurisdiction, including those related to cryptocurrency and financial regulations.</li>
            <li>You agree not to use ZecBlock for any unlawful purpose, including money laundering, fraud, or sanctions evasion.</li>
            <li>You agree not to abuse our API or infrastructure (e.g. excessive automated requests).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-primary mb-3">6. Intellectual Property</h2>
          <p>
            ZecBlock is open-source software. The source code is available on{' '}
            <a href="https://github.com/Kenbak/cipherscan" target="_blank" rel="noopener noreferrer" className="legal-link">
              GitHub
            </a>{' '}
            under its respective license. The ZecBlock name, logo, and branding are trademarks of Atmosphere Labs.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-primary mb-3">7. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, ZecBlock and Atmosphere Labs shall not be liable for any
            indirect, incidental, special, consequential, or punitive damages, including loss of funds,
            arising from your use of the service. Our total liability is limited to the amount you paid us
            (which is zero — the service is free).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-primary mb-3">8. Availability</h2>
          <p>
            We strive to keep ZecBlock available 24/7 but do not guarantee uninterrupted access. We may
            modify, suspend, or discontinue any part of the service at any time without notice. Indexed data may be delayed, incomplete or revised after a reorganization. Estimates and third-party labels are not guarantees. Testnet and Crosslink data describe separate networks and must not be treated as mainnet balances.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-primary mb-3">9. Changes</h2>
          <p>
            We may update these terms from time to time. Continued use of ZecBlock after changes
            constitutes acceptance of the revised terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-primary mb-3">10. Contact</h2>
          <p>
            Questions? Reach us on{' '}
            <a href="https://x.com/zecblock" target="_blank" rel="noopener noreferrer" className="legal-link">
              X / Twitter
            </a>{' '}
            or open an issue on{' '}
            <a href="https://github.com/Kenbak/cipherscan" target="_blank" rel="noopener noreferrer" className="legal-link">
              GitHub
            </a>.
          </p>
        </section>
      </div>
    </div>
  );
}
