import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service | CipherScan',
  description: 'CipherScan terms of service — rules for using the platform.',
  alternates: { canonical: 'https://cipherscan.app/terms' },
};

export default function TermsPage() {
  const updated = 'April 25, 2026';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
      <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
        <span className="opacity-50">{'>'}</span> LEGAL
      </p>
      <h1 className="text-2xl sm:text-3xl font-bold text-primary mb-2">Terms of Service</h1>
      <p className="text-sm text-muted font-mono mb-10">Last updated: {updated}</p>

      <div className="prose-legal space-y-8 text-sm text-secondary leading-relaxed">
        <section>
          <h2 className="text-lg font-bold text-primary mb-3">1. Acceptance</h2>
          <p>
            By accessing or using CipherScan (<Link href="/" className="text-cipher-cyan hover:underline">cipherscan.app</Link>),
            you agree to these Terms of Service. If you do not agree, do not use the service.
            CipherScan is operated by Atmosphere Labs (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">2. Description of Service</h2>
          <p>
            CipherScan is a free, open-source Zcash blockchain explorer. We provide tools to browse
            publicly available blockchain data, decode transactions, check privacy metrics, swap
            cryptocurrency, and access developer APIs. The service is provided &ldquo;as is&rdquo; without warranty.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">3. No Financial Advice</h2>
          <p>
            Nothing on CipherScan constitutes financial, investment, legal, or tax advice. Blockchain data,
            price information, and swap quotes are provided for informational purposes only. You are solely
            responsible for your financial decisions.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">4. Swap &amp; On-Ramp Services</h2>
          <p className="mb-3">
            CipherScan integrates third-party services to facilitate cross-chain swaps and fiat-to-crypto
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
          <h2 className="text-lg font-bold text-primary mb-3">5. User Responsibilities</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>You are responsible for the security of your wallet, private keys, and viewing keys.</li>
            <li>You must comply with all applicable laws in your jurisdiction, including those related to cryptocurrency and financial regulations.</li>
            <li>You agree not to use CipherScan for any unlawful purpose, including money laundering, fraud, or sanctions evasion.</li>
            <li>You agree not to abuse our API or infrastructure (e.g. excessive automated requests).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">6. Intellectual Property</h2>
          <p>
            CipherScan is open-source software. The source code is available on{' '}
            <a href="https://github.com/Kenbak/cipherscan" target="_blank" rel="noopener noreferrer" className="text-cipher-cyan hover:underline">
              GitHub
            </a>{' '}
            under its respective license. The CipherScan name, logo, and branding are trademarks of Atmosphere Labs.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">7. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, CipherScan and Atmosphere Labs shall not be liable for any
            indirect, incidental, special, consequential, or punitive damages, including loss of funds,
            arising from your use of the service. Our total liability is limited to the amount you paid us
            (which is zero — the service is free).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">8. Availability</h2>
          <p>
            We strive to keep CipherScan available 24/7 but do not guarantee uninterrupted access. We may
            modify, suspend, or discontinue any part of the service at any time without notice.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">9. Changes</h2>
          <p>
            We may update these terms from time to time. Continued use of CipherScan after changes
            constitutes acceptance of the revised terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">10. Contact</h2>
          <p>
            Questions? Reach us on{' '}
            <a href="https://twitter.com/cipherscan_app" target="_blank" rel="noopener noreferrer" className="text-cipher-cyan hover:underline">
              X / Twitter
            </a>{' '}
            or open an issue on{' '}
            <a href="https://github.com/Kenbak/cipherscan" target="_blank" rel="noopener noreferrer" className="text-cipher-cyan hover:underline">
              GitHub
            </a>.
          </p>
        </section>
      </div>
    </div>
  );
}
