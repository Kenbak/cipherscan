import { Metadata } from 'next';
import Link from 'next/link';
import { API_CONFIG } from '@/lib/api-config';
import { NETWORK_LABEL } from '@/lib/config';

export const metadata: Metadata = {
  title: 'About | CipherScan',
  description:
    'Privacy-first Zcash blockchain explorer. Born at the Zypherpunk hackathon. Making privacy visual, understandable, and accessible to all.',
};

const API_URL = API_CONFIG.POSTGRES_API_URL;

interface LiveStats {
  blocksIndexed: number | null;
  totalTransactions: number | null;
  shieldedTxAnalyzed: number | null;
}

async function getLiveStats(): Promise<LiveStats> {
  try {
    const [networkRes, privacyRes] = await Promise.allSettled([
      fetch(`${API_URL}/api/network/stats`, { next: { revalidate: 60 } }),
      fetch(`${API_URL}/api/privacy-stats`, { next: { revalidate: 60 } }),
    ]);

    const network =
      networkRes.status === 'fulfilled' && networkRes.value.ok
        ? await networkRes.value.json()
        : null;
    const privacy =
      privacyRes.status === 'fulfilled' && privacyRes.value.ok
        ? await privacyRes.value.json()
        : null;

    return {
      blocksIndexed: network?.blockchain?.height ?? null,
      totalTransactions: privacy?.totals?.totalTx ?? null,
      shieldedTxAnalyzed: privacy?.totals?.shieldedTx ?? null,
    };
  } catch {
    return { blocksIndexed: null, totalTransactions: null, shieldedTxAnalyzed: null };
  }
}

function fmt(n: number | null): string {
  if (n === null || n === undefined) return '...';
  return n.toLocaleString();
}

const timeline = [
  {
    date: 'NOV 2025',
    tag: 'ORIGIN',
    tagColor: 'text-cipher-cyan',
    dotColor: 'bg-cipher-cyan shadow-[0_0_8px_rgba(0,229,255,0.6)]',
    title: 'Built at Zypherpunk',
    description:
      "Created at the world's first Zcash privacy hackathon. 300+ projects. Won 4 tracks: Project Tachyon, Gemini, Raybot, and Network State. From zero to a working explorer in days.",
  },
  {
    date: 'DEC 2025',
    tag: 'WASM',
    tagColor: 'text-purple-400',
    dotColor: 'bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.6)]',
    title: 'Browser-Native Decryption',
    description:
      'First frontend WASM-powered Zcash transaction decoder. Decrypt shielded memos entirely in-browser — no server, no keys shared, no trust required.',
  },
  // {
  //   date: 'DEC 2025',
  //   tag: 'INTEGRATION',
  //   tagColor: 'text-cipher-green',
  //   dotColor: 'bg-cipher-green shadow-[0_0_8px_rgba(0,255,148,0.6)]',
  //   title: 'Near Intents',
  //   description:
  //     'Cross-chain integration connecting Zcash privacy with the broader multichain ecosystem.',
  // },
  {
    date: 'JAN 2026',
    tag: 'ANALYTICS',
    tagColor: 'text-cipher-cyan',
    dotColor: 'bg-cipher-cyan shadow-[0_0_8px_rgba(0,229,255,0.6)]',
    title: 'Privacy Risks & Batch Patterns',
    description:
      'Advanced deshielding pattern detection and linkability analysis. Identifying on-chain behaviors that compromise Zcash privacy — and making that data accessible to everyone.',
  },
  {
    date: 'FEB 2026',
    tag: 'GRANT',
    tagColor: 'text-yellow-400',
    dotColor: 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.6)]',
    title: 'ZCG Grant Awarded',
    description:
      'Funded by the Zcash Community Grants program. Community recognition that privacy visibility infrastructure is essential for the ecosystem.',
  },
  // {
  //   date: 'FEB 2026',
  //   tag: 'NPM',
  //   tagColor: 'text-purple-400',
  //   dotColor: 'bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.6)]',
  //   title: 'Published as NPM Package',
  //   description:
  //     "Core libraries on NPM. Any developer can build on Zcash data and privacy tooling without starting from scratch.",
  // },
];

export default async function AboutPage() {
  const stats = await getLiveStats();

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">

        {/* Hero */}
        <div className="mb-20 sm:mb-28">
          <div className="mb-6">
            <span className="font-mono text-xs text-muted tracking-[0.3em] uppercase">
              {'>'} about
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold font-mono mb-6 leading-[1.1]">
            <span className="text-primary">Decode the blockchain.</span>
            <br />
            <span className="text-cipher-cyan">Protect the user.</span>
          </h1>
          <p className="text-base sm:text-lg text-muted max-w-2xl leading-relaxed mb-6">
            CipherScan is a privacy-first Zcash blockchain explorer.
            Not just a block browser — a tool for understanding, analyzing, and
            visualizing what privacy means on-chain. Making the invisible visible
            without compromising individuals.
          </p>
          <p className="text-sm text-muted/60 font-mono">
            Created by <span className="text-primary">Kenbak</span>
          </p>
        </div>

        {/* Live Stats */}
        <div className="mb-20 sm:mb-28">
          <div className="grid grid-cols-3 gap-6 sm:gap-8">
            {[
              { label: 'Blocks Indexed', value: fmt(stats.blocksIndexed), color: 'text-cipher-cyan' },
              { label: 'Transactions Tracked', value: fmt(stats.totalTransactions), color: 'text-purple-400' },
              { label: 'Shielded TXs Analyzed', value: fmt(stats.shieldedTxAnalyzed), color: 'text-cipher-green' },
            ].map((stat) => (
              <div key={stat.label}>
                <div className={`text-2xl sm:text-3xl lg:text-4xl font-bold font-mono ${stat.color} leading-none`}>
                  {stat.value}
                </div>
                <div className="text-[9px] sm:text-[10px] text-muted/50 font-mono uppercase tracking-wider mt-2">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5">
            <span className="text-[9px] text-muted/30 font-mono">LIVE FROM {NETWORK_LABEL}</span>
          </div>
        </div>

        {/* Timeline */}
        <div className="mb-20 sm:mb-28">
          <div className="mb-8">
            <span className="font-mono text-[10px] text-muted tracking-[0.3em] uppercase">
              {'>'} timeline
            </span>
          </div>

          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[5px] top-2 bottom-2 w-px bg-gradient-to-b from-cipher-cyan/40 via-purple-400/20 to-transparent" />

            <div className="space-y-8 sm:space-y-10">
              {timeline.map((item, i) => (
                <div key={i} className="relative pl-8">
                  <div className={`absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full ${item.dotColor}`} />

                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-mono text-[10px] text-muted tracking-widest">
                      {item.date}
                    </span>
                    <span className={`font-mono text-[10px] font-bold tracking-widest ${item.tagColor}`}>
                      [{item.tag}]
                    </span>
                  </div>

                  <h3 className="text-sm sm:text-base font-bold font-mono text-primary mb-1">
                    {item.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-muted leading-relaxed max-w-2xl">
                    {item.description}
                  </p>
                </div>
              ))}

              {/* Ongoing */}
              <div className="relative pl-8">
                <div className="absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full border border-muted/30 bg-transparent animate-pulse" />
                <span className="font-mono text-[10px] text-muted tracking-widest">[BUILDING]</span>
                <p className="text-xs text-muted/60 font-mono mt-1">More to come.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Mission */}
        <div className="mb-20 sm:mb-28">
          <div className="mb-5">
            <span className="font-mono text-[10px] text-muted tracking-[0.3em] uppercase">
              {'>'} why
            </span>
          </div>
          <p className="text-sm sm:text-base text-muted leading-relaxed max-w-2xl mb-4">
            Zcash has the strongest privacy technology in crypto. But privacy is invisible
            by default — that&apos;s the point. The problem: if you can&apos;t see it, you can&apos;t
            understand it, measure it, or improve it.
          </p>
          <p className="text-sm sm:text-base text-muted leading-relaxed max-w-2xl">
            CipherScan makes privacy visual, understandable, and accessible to all — developers,
            researchers, and everyday users. We show the shielded pool&apos;s health, detect patterns
            that risk privacy, and provide the tools to explore a blockchain designed to be private.
          </p>
        </div>

        {/* Open Source CTA */}
        <div className="border border-cipher-border rounded-2xl p-6 sm:p-8 card-surface">
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-base sm:text-lg font-bold font-mono text-cipher-cyan mb-2">
                Open source. Community funded.
              </h2>
              <p className="text-xs sm:text-sm text-muted leading-relaxed max-w-lg">
                CipherScan is fully open source and funded by the Zcash community.
                Contributions, issues, and feedback are welcome.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href="https://github.com/Kenbak/cipherscan"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-cipher-border rounded-lg font-mono text-xs text-muted hover:text-cipher-cyan hover:border-cipher-cyan/40 transition-colors duration-150"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                GitHub
              </a>
              <a
                href="https://twitter.com/cipherscan_app"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-cipher-border rounded-lg font-mono text-xs text-muted hover:text-cipher-cyan hover:border-cipher-cyan/40 transition-colors duration-150"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                @cipherscan_app
              </a>
              <Link
                href="/docs"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-cipher-cyan/10 border border-cipher-cyan/30 rounded-lg font-mono text-xs text-cipher-cyan hover:bg-cipher-cyan/20 transition-colors duration-150"
              >
                API Docs
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
