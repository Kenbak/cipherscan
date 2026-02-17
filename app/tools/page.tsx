import Link from 'next/link';

const tools = [
  {
    href: '/tools/decode',
    title: 'Decode Raw Transaction',
    desc: 'Parse a raw transaction hex into human-readable fields — inputs, outputs, shielded data, and more.',
    color: 'cyan' as const,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
    badge: 'POST /api/tx/decode',
  },
  {
    href: '/tools/broadcast',
    title: 'Broadcast Transaction',
    desc: 'Submit a pre-signed raw transaction to the Zcash network via a live Zebra node.',
    color: 'green' as const,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    badge: 'POST /api/tx/broadcast',
  },
  {
    href: '/decrypt',
    title: 'Decrypt Shielded Memo',
    desc: 'Decode encrypted memos from Sapling and Orchard transactions using your viewing key. 100% client-side.',
    color: 'purple' as const,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    badge: 'Client-side WASM',
  },
];

const colorMap = {
  cyan: {
    iconBg: 'bg-cipher-cyan/10',
    iconText: 'text-cipher-cyan',
    badgeBg: 'bg-cipher-cyan/10',
    badgeText: 'text-cipher-cyan',
    hoverBorder: 'hover:border-cipher-cyan/30',
  },
  green: {
    iconBg: 'bg-cipher-green/10',
    iconText: 'text-cipher-green',
    badgeBg: 'bg-cipher-green/10',
    badgeText: 'text-cipher-green',
    hoverBorder: 'hover:border-cipher-green/30',
  },
  purple: {
    iconBg: 'bg-purple-500/10',
    iconText: 'text-purple-400',
    badgeBg: 'bg-purple-500/10',
    badgeText: 'text-purple-400',
    hoverBorder: 'hover:border-purple-500/30',
  },
};

export default function ToolsPage() {
  return (
    <div className="min-h-screen py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-10 sm:mb-12">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-cipher-cyan/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-cipher-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-primary">
                Developer Tools
              </h1>
              <p className="text-sm text-secondary">
                Inspect, decode, and broadcast Zcash transactions
              </p>
            </div>
          </div>
        </div>

        {/* Tool Cards */}
        <div className="space-y-4 sm:space-y-6">
          {tools.map((tool) => {
            const colors = colorMap[tool.color];
            return (
              <Link
                key={tool.href}
                href={tool.href}
                className={`card card-interactive block p-6 ${colors.hoverBorder}`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-lg ${colors.iconBg} flex items-center justify-center flex-shrink-0`}>
                    <span className={colors.iconText}>{tool.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-base font-semibold text-primary">{tool.title}</h2>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${colors.badgeBg} ${colors.badgeText}`}>
                        {tool.badge}
                      </span>
                    </div>
                    <p className="text-sm text-secondary leading-relaxed">{tool.desc}</p>
                  </div>
                  <svg className="w-5 h-5 text-muted flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            );
          })}
        </div>

        {/* API Reference */}
        <div className="card-glass p-6 mt-10 sm:mt-12">
          <h3 className="text-xs font-mono text-muted mb-4 uppercase tracking-wider">&gt; API_ENDPOINTS</h3>
          <div className="space-y-3 text-sm font-mono">
            <div className="flex items-center gap-3">
              <span className="badge badge-cyan text-[10px]">POST</span>
              <code className="text-primary">/api/tx/decode</code>
              <span className="text-muted hidden sm:inline">— Decode raw transaction hex</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="badge badge-green text-[10px]">POST</span>
              <code className="text-primary">/api/tx/broadcast</code>
              <span className="text-muted hidden sm:inline">— Broadcast signed transaction</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="badge badge-purple text-[10px]">GET</span>
              <code className="text-primary">/api/tx/:txid</code>
              <span className="text-muted hidden sm:inline">— Get transaction details</span>
            </div>
          </div>
          <p className="text-xs text-muted mt-4">
            Full documentation at{' '}
            <Link href="/docs" className="text-cipher-cyan hover:underline">/docs</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
