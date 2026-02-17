import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody } from '@/components/ui/Card';

// Icons
const Icons = {
  Code: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  ),
  Bolt: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  Lock: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
  ChevronRight: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),
};

const tools = [
  {
    href: '/tools/decode',
    title: 'Decode Raw Transaction',
    desc: 'Parse a raw transaction hex into human-readable fields, inputs, outputs, shielded data, and more.',
    icon: Icons.Code,
    badge: 'Client-side',
  },
  {
    href: '/tools/broadcast',
    title: 'Broadcast Transaction',
    desc: 'Submit a pre-signed raw transaction to the Zcash network via a live Zebra node.',
    icon: Icons.Bolt,
    badge: 'API',
  },
  {
    href: '/decrypt',
    title: 'Decrypt Shielded Memo',
    desc: 'Decode encrypted memos from Sapling and Orchard transactions using your viewing key. 100% client-side.',
    icon: Icons.Lock,
    badge: 'Client-side WASM',
  },
];

export default function ToolsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Header - cypherpunk style */}
      <div className="mb-8 animate-fade-in">
        <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
          <span className="opacity-50">{'>'}</span> DEVELOPER_TOOLS
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-primary">
          Transaction Tools
        </h1>
        <p className="text-sm text-secondary mt-2">
          Inspect, decode, and broadcast Zcash transactions
        </p>
      </div>

      {/* Tool Cards */}
      <div className="space-y-4 animate-fade-in-up" style={{ animationDelay: '50ms' }}>
        {tools.map((tool) => {
          const IconComponent = tool.icon;
          return (
            <Link key={tool.href} href={tool.href} className="block">
              <Card interactive>
                <CardBody className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-cipher-cyan/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-cipher-cyan">
                      <IconComponent />
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-base font-semibold text-primary">{tool.title}</h2>
                      <Badge color="cyan">{tool.badge}</Badge>
                    </div>
                    <p className="text-sm text-secondary leading-relaxed">{tool.desc}</p>
                  </div>
                  <span className="text-muted flex-shrink-0 mt-0.5">
                    <Icons.ChevronRight />
                  </span>
                </CardBody>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* API Reference */}
      <div className="mt-10 sm:mt-12 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
        <Card variant="glass">
          <CardBody>
            <h3 className="text-xs font-mono text-muted mb-4 uppercase tracking-widest">
              <span className="opacity-50">{'>'}</span> API_ENDPOINTS
            </h3>
            <div className="space-y-3 text-sm font-mono">
              <div className="flex items-center gap-3">
                <Badge color="green">POST</Badge>
                <code className="text-primary">/api/tx/broadcast</code>
                <span className="text-muted hidden sm:inline">— Broadcast signed transaction</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge color="cyan">GET</Badge>
                <code className="text-primary">/api/tx/:txid</code>
                <span className="text-muted hidden sm:inline">— Get transaction details</span>
              </div>
            </div>
            <p className="text-xs text-muted mt-4">
              Full documentation at{' '}
              <Link href="/docs" className="text-cipher-cyan hover:underline font-mono">/docs</Link>
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
