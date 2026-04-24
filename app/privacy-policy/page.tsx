import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | CipherScan',
  description: 'CipherScan privacy policy — how we handle your data.',
  alternates: { canonical: 'https://cipherscan.app/privacy-policy' },
};

export default function PrivacyPolicyPage() {
  const updated = 'April 25, 2026';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
      <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
        <span className="opacity-50">{'>'}</span> LEGAL
      </p>
      <h1 className="text-2xl sm:text-3xl font-bold text-primary mb-2">Privacy Policy</h1>
      <p className="text-sm text-muted font-mono mb-10">Last updated: {updated}</p>

      <div className="prose-legal space-y-8 text-sm text-secondary leading-relaxed">
        <section>
          <h2 className="text-lg font-bold text-primary mb-3">1. Who We Are</h2>
          <p>
            CipherScan (<Link href="/" className="text-cipher-cyan hover:underline">cipherscan.app</Link>) is
            an open-source Zcash blockchain explorer operated by Atmosphere Labs (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">2. Information We Collect</h2>
          <p className="mb-3"><strong className="text-primary">We do not collect personal data.</strong> No accounts, no registration, no IP logging, no analytics.</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong className="text-primary">No server logs:</strong> We do not log IP addresses, user-agents, or browsing activity.</li>
            <li><strong className="text-primary">Blockchain data:</strong> All blockchain data displayed on CipherScan is publicly available on the Zcash network. Shielded transaction contents are never visible to us or anyone without the appropriate viewing keys.</li>
            <li><strong className="text-primary">Viewing keys:</strong> If you use our Decrypt Memo tool, viewing keys are processed entirely in your browser (client-side) and are never transmitted to our servers.</li>
            <li><strong className="text-primary">Wallet addresses:</strong> If you use the Swap feature and connect a wallet, your wallet address is used solely to facilitate the transaction and is not stored by us.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">3. Third-Party Services</h2>
          <p className="mb-3">We integrate with third-party services that have their own privacy policies:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong className="text-primary">NEAR Intents (1-Click Swap):</strong> Cross-chain swap quotes and execution. When you initiate a swap, your transaction data is shared with NEAR Intents to facilitate the exchange.</li>
            <li><strong className="text-primary">Fiat on-ramp providers:</strong> If you purchase cryptocurrency with a credit card through an embedded widget, you interact directly with the provider (e.g. MoonPay). They may require identity verification (KYC). We do not receive or store your payment information.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">4. Cookies &amp; Tracking</h2>
          <p>
            We do not use analytics cookies, advertising trackers, or fingerprinting. We store a theme preference
            (light/dark) in your browser&rsquo;s local storage. That&rsquo;s it.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">5. Data Sharing</h2>
          <p>
            We do not sell, rent, or share your personal information with third parties for marketing purposes.
            We may disclose information if required by law or to protect the security of our service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">6. Data Security</h2>
          <p>
            We use HTTPS encryption for all connections. Our servers are secured with standard industry practices.
            However, no method of transmission over the internet is 100% secure.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">7. Your Rights</h2>
          <p>
            Since we collect minimal data and do not maintain user accounts, there is generally no personal data to
            access, modify, or delete. If you have questions about data we may hold, contact us.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">8. Changes</h2>
          <p>
            We may update this policy from time to time. Changes will be posted on this page with a revised
            &ldquo;last updated&rdquo; date.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary mb-3">9. Contact</h2>
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
