import type { Metadata } from 'next';
import DecryptPageClient from '@/components/DecryptPageClient';

export const metadata: Metadata = {
  title: 'Zcash Decrypt Memo Tool - Decode Shielded Transaction Messages | CipherScan',
  description: 'Free online tool to decrypt Zcash shielded transaction memos. Decode encrypted messages from Sapling and Orchard transactions using your viewing key. 100% client-side, your keys never leave your browser.',
  keywords: [
    'zcash decrypt memo',
    'zcash memo tool',
    'decrypt shielded transaction',
    'zcash viewing key',
    'zcash encrypted memo',
    'decode zcash memo',
    'zcash memo decoder',
    'sapling transaction decrypt',
    'orchard transaction decrypt',
    'zcash shielded message',
    'zcash memo reader',
    'ZEC decrypt',
    'zcash privacy tool',
    'zcash transaction viewer',
    'UFVK decrypt',
  ],
  openGraph: {
    title: 'Zcash Decrypt Memo Tool - Decode Shielded Messages',
    description: 'Free tool to decrypt Zcash shielded transaction memos using your viewing key. 100% client-side decryption — your keys never leave your browser.',
    url: 'https://cipherscan.app/decrypt',
    siteName: 'CipherScan',
    type: 'website',
    images: [
      {
        url: 'https://cipherscan.app/og-image.png?v=2',
        width: 1200,
        height: 630,
        alt: 'CipherScan - Zcash Decrypt Memo Tool',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Zcash Decrypt Memo Tool | CipherScan',
    description: 'Decrypt Zcash shielded transaction memos in your browser. No server, no tracking, 100% private.',
    images: ['https://cipherscan.app/og-image.png?v=2'],
  },
  alternates: {
    canonical: 'https://cipherscan.app/decrypt',
  },
};

// JSON-LD structured data for the decrypt tool
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Zcash Decrypt Memo Tool',
  description: 'Free online tool to decrypt Zcash shielded transaction memos using a Unified Full Viewing Key (UFVK). Supports Sapling and Orchard transactions. 100% client-side decryption using WebAssembly.',
  url: 'https://cipherscan.app/decrypt',
  applicationCategory: 'UtilityApplication',
  operatingSystem: 'Web Browser',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  creator: {
    '@type': 'Organization',
    name: 'CipherScan',
    url: 'https://cipherscan.app',
  },
  featureList: [
    'Decrypt Zcash shielded transaction memos',
    'Support for Sapling and Orchard transactions',
    'Client-side decryption using WebAssembly',
    'Encrypted inbox scanner',
    'No server-side processing — viewing keys never leave the browser',
  ],
};

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How do I decrypt a Zcash memo?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'To decrypt a Zcash memo, you need a Unified Full Viewing Key (UFVK) from a compatible wallet like YWallet, Zkool, or Zingo. Enter the transaction ID and your viewing key in the CipherScan Decrypt Memo tool. All decryption happens client-side in your browser using WebAssembly — your keys are never sent to any server.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is it safe to use my viewing key on CipherScan?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. CipherScan performs all decryption client-side using WebAssembly. Your viewing key never leaves your browser and is never transmitted to any server. A viewing key only allows you to read transactions — it cannot spend your funds.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is a Zcash encrypted memo?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Zcash encrypted memos are 512-byte messages attached to shielded transactions. They are encrypted so that only the recipient (or anyone with the viewing key) can read them. Memos can contain text messages, payment references, or structured data.',
      },
    },
    {
      '@type': 'Question',
      name: 'Which Zcash transaction types support encrypted memos?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Encrypted memos are supported in Sapling and Orchard shielded transactions. Transparent transactions do not support encrypted memos. The CipherScan decrypt tool supports both Sapling and Orchard memo decryption.',
      },
    },
    {
      '@type': 'Question',
      name: 'Where do I get a Unified Full Viewing Key (UFVK)?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'You can export a UFVK from compatible Zcash wallets including YWallet (mobile & desktop), Zkool (mobile), and Zingo CLI (command-line). The viewing key lets you decrypt and view transactions without the ability to spend funds.',
      },
    },
  ],
};

export default function DecryptPage() {
  return (
    <>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <div className="min-h-screen py-12 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Interactive Tool */}
          <DecryptPageClient />

          {/* SEO Content: FAQ Section (visible, crawlable by Google) */}
          <section className="mt-16 border-t border-cipher-border pt-12">
            <h2 className="text-xl font-bold text-primary mb-8">Frequently Asked Questions</h2>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="card p-5">
                <h3 className="font-semibold text-primary mb-2">How do I decrypt a Zcash memo?</h3>
                <p className="text-sm text-secondary leading-relaxed">
                  Enter the transaction ID and your Unified Full Viewing Key (UFVK) in the tool above.
                  CipherScan decrypts the memo entirely in your browser using WebAssembly.
                  Your viewing key is never sent to any server.
                </p>
              </div>
              <div className="card p-5">
                <h3 className="font-semibold text-primary mb-2">Is it safe to use my viewing key here?</h3>
                <p className="text-sm text-secondary leading-relaxed">
                  Yes. All decryption happens client-side in your browser. Your viewing key never leaves your device.
                  A viewing key only allows reading transactions — it cannot spend your funds.
                </p>
              </div>
              <div className="card p-5">
                <h3 className="font-semibold text-primary mb-2">What is a Zcash encrypted memo?</h3>
                <p className="text-sm text-secondary leading-relaxed">
                  Zcash encrypted memos are 512-byte messages attached to shielded (Sapling and Orchard) transactions.
                  They are encrypted so only the recipient can read them, and can contain text messages,
                  payment references, or any arbitrary data.
                </p>
              </div>
              <div className="card p-5">
                <h3 className="font-semibold text-primary mb-2">Where do I get a viewing key?</h3>
                <p className="text-sm text-secondary leading-relaxed">
                  Export a Unified Full Viewing Key (UFVK) from compatible wallets:
                  YWallet (mobile & desktop), Zkool (mobile), or Zingo CLI (command-line).
                  The UFVK allows viewing transactions without spending ability.
                </p>
              </div>
              <div className="card p-5">
                <h3 className="font-semibold text-primary mb-2">Which transaction types are supported?</h3>
                <p className="text-sm text-secondary leading-relaxed">
                  This tool supports decrypting memos from both Sapling and Orchard shielded transactions.
                  Transparent transactions do not have encrypted memos.
                  Use the Inbox Scanner to scan multiple transactions at once.
                </p>
              </div>
              <div className="card p-5">
                <h3 className="font-semibold text-primary mb-2">Can I scan all my transactions at once?</h3>
                <p className="text-sm text-secondary leading-relaxed">
                  Yes. Switch to the &quot;Inbox&quot; tab to use the Encrypted Inbox Scanner.
                  It scans recent Orchard transactions on the Zcash blockchain and decrypts
                  any that match your viewing key, all within your browser.
                </p>
              </div>
            </div>
          </section>

          {/* Additional SEO content */}
          <section className="mt-12 border-t border-cipher-border pt-12 mb-8">
            <h2 className="text-xl font-bold text-primary mb-4">About Zcash Memo Decryption</h2>
            <div className="prose prose-sm max-w-none text-secondary leading-relaxed space-y-4">
              <p>
                Zcash is unique among cryptocurrencies in offering encrypted memos attached to shielded transactions.
                These memos allow users to include private messages, payment references, invoice numbers, or any
                arbitrary data — all protected by the same zero-knowledge cryptography that shields transaction amounts
                and addresses.
              </p>
              <p>
                The CipherScan Decrypt Memo tool is a free, open-source utility that lets you decode these encrypted
                messages directly in your web browser. Unlike other tools that require running a full Zcash node or
                using command-line interfaces, CipherScan provides a simple web interface powered by WebAssembly
                for instant, private decryption.
              </p>
              <p>
                Whether you need to verify a payment memo, read a private message, or audit your shielded transaction
                history, CipherScan&apos;s decrypt tool handles Sapling and Orchard transactions with zero-knowledge proof
                verification — all without your viewing key ever leaving your browser.
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
