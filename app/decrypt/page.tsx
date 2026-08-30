import DecryptPageClient from '@/components/DecryptPageClient';
import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Decrypt Zcash Transaction Memos | CipherScan',
  description: 'Decrypt Orchard and Ironwood transaction memos in your browser using a Zcash viewing key. Your key never leaves your device.',
  keywords: [
    'zcash decrypt memo',
    'zcash memo tool',
    'decrypt shielded transaction',
    'zcash viewing key',
    'zcash encrypted memo',
    'decode zcash memo',
    'zcash memo decoder',
    'orchard transaction decrypt',
    'ironwood transaction decrypt',
    'zcash shielded message',
    'zcash memo reader',
    'ZEC decrypt',
    'zcash privacy tool',
    'zcash transaction viewer',
    'UFVK decrypt',
  ],
  path: '/decrypt',
  imageAlt: 'CipherScan - Zcash Decrypt Memo Tool',
  networks: ['mainnet'],
});

// JSON-LD structured data for the decrypt tool
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Zcash Decrypt Memo Tool',
  description: 'Free online tool to decrypt Zcash shielded transaction memos using a Unified Full Viewing Key (UFVK). Supports Orchard and Ironwood transactions. 100% client-side decryption using WebAssembly.',
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
    'Support for Orchard and Ironwood transactions',
    'Client-side decryption using WebAssembly',
    'Encrypted inbox scanner',
    'No server-side processing, viewing keys never leave the browser',
  ],
};

const faqs = [
  {
    question: 'How do I decrypt a Zcash memo?',
    answer: 'Enter the transaction ID and your Unified Full Viewing Key (UFVK) in the tool above. CipherScan decrypts the memo entirely in your browser using WebAssembly — your viewing key is never sent to any server.',
  },
  {
    question: 'Is it safe to use my viewing key here?',
    answer: 'Yes. A viewing key only allows reading transactions; it cannot spend funds. All decryption happens client-side, so the key itself never leaves your device.',
  },
  {
    question: 'What is a Zcash encrypted memo?',
    answer: 'A 512-byte message attached to a shielded (Sapling, Orchard, or Ironwood) transaction. Only the recipient, or anyone with the viewing key, can read it. Memos can contain text, payment references, or arbitrary data.',
  },
  {
    question: 'Where do I get a viewing key?',
    answer: 'Export a Unified Full Viewing Key (UFVK) from a compatible wallet — see the list above (Vizor, Zkool, or Zingo CLI).',
  },
  {
    question: 'Which transaction types are supported?',
    answer: 'Orchard and Ironwood shielded transactions. Sapling memo decryption isn\u2019t supported yet (Sapling notes carry memos too, but this tool can\u2019t decrypt them). Transparent transactions have no encrypted memo field.',
  },
  {
    question: 'Can I scan all my transactions at once?',
    answer: 'Yes — switch to the "Inbox" tab. It scans recent Orchard transactions and decrypts any that match your viewing key, all within your browser.',
  },
];

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer,
    },
  })),
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

          {/* SEO Content: FAQ Section (visible, crawlable by Google — <details> renders server-side) */}
          <section className="mt-16 border-t border-cipher-border pt-12">
            <h2 className="text-xl font-bold text-primary mb-6">Frequently Asked Questions</h2>
            <div className="card divide-y divide-cipher-border">
              {faqs.map((faq) => (
                <details key={faq.question} className="group py-4 first:pt-0 last:pb-0">
                  <summary className="flex items-center justify-between gap-3 cursor-pointer list-none font-semibold text-primary text-sm sm:text-base">
                    {faq.question}
                    <svg
                      className="w-4 h-4 text-muted flex-shrink-0 transition-transform group-open:rotate-180"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </summary>
                  <p className="text-sm text-secondary leading-relaxed mt-2">{faq.answer}</p>
                </details>
              ))}
            </div>
          </section>

          {/* Additional SEO context — kept short; the facts above already cover the details */}
          <section className="mt-8 mb-8">
            <p className="text-xs text-muted leading-relaxed max-w-2xl">
              Zcash is one of the only cryptocurrencies with encrypted memos on shielded transactions —
              free-text or structured data protected by the same zero-knowledge cryptography that hides amounts
              and addresses. CipherScan&apos;s decrypt tool is free and open-source, decoding Orchard and Ironwood
              memos entirely in WebAssembly with no server round-trip and no node or CLI required.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
