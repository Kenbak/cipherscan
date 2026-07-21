'use client';

import Link from 'next/link';
import ApiSidebar from './components/ApiSidebar';
import ApiEndpoint from './components/ApiEndpoint';
import { getEndpoints, getEndpointsByCategory } from './endpoints';
import { getApiUrl, NETWORK } from '@/lib/api-config';

export default function DocsPage() {
  const baseUrl = getApiUrl();
  const categories = getEndpointsByCategory(baseUrl);
  const endpoints = getEndpoints(baseUrl);

  const networkLabel = NETWORK === 'mainnet' ? 'Mainnet' : NETWORK === 'crosslink-testnet' ? 'Crosslink' : 'Testnet';

  return (
    <div className="min-h-screen flex">
      <ApiSidebar
        categories={categories.map(cat => ({
          name: cat.name,
          endpoints: cat.endpoints.map(e => ({
            id: e.id,
            path: e.path,
            method: e.method
          }))
        }))}
      />

      <main className="flex-1 py-12 px-4 lg:px-12 max-w-5xl">
        {/* Header */}
        <div className="mb-12">
          <Link href="/" className="text-cipher-cyan hover:text-cipher-green transition-colors text-sm font-mono mb-4 inline-block">
            ← Back to Explorer
          </Link>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 font-mono text-primary">
            API Documentation
          </h1>
          <p className="text-base sm:text-lg text-secondary max-w-3xl">
            Free, open API for accessing Zcash blockchain data. {endpoints.length} endpoints, no authentication required.
          </p>
        </div>

        {/* Quick Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          <div className="card">
            <div className="text-sm text-secondary mb-1">Base URL</div>
            <code className="text-xs sm:text-sm text-cipher-cyan break-all">{baseUrl}/api</code>
          </div>
          <div className="card">
            <div className="text-sm text-secondary mb-1">Network</div>
            <div className="text-lg sm:text-xl font-bold text-primary">{networkLabel}</div>
            <div className="text-xs text-muted">Auto-detected from domain</div>
          </div>
          <div className="card">
            <div className="text-sm text-secondary mb-1">Rate Limit</div>
            <div className="text-lg sm:text-xl font-bold text-primary">100 req/min</div>
            <div className="text-xs text-muted">Per IP address</div>
          </div>
          <div className="card">
            <div className="text-sm text-secondary mb-1">Authentication</div>
            <div className="text-lg sm:text-xl font-bold text-cipher-green">None Required</div>
            <div className="text-xs text-muted">Free & open</div>
          </div>
        </div>

        {/* Important Notes */}
        <div className="card gradient-card-purple mb-12">
          <h2 className="text-xl font-bold mb-4 text-primary">
            Privacy & Limitations
          </h2>
          <div className="space-y-3 text-sm text-secondary">
            <p>
              <strong className="text-primary">Shielded Addresses:</strong> Due to Zcash&apos;s privacy features,
              shielded addresses (z-addresses) and their balances cannot be queried. Only transparent addresses
              (t-addresses) and unified addresses with transparent receivers are supported.
            </p>
            <p>
              <strong className="text-primary">Networks:</strong> This API is available on both{' '}
              <code className="text-cipher-cyan">mainnet</code> ({' '}
              <code className="text-xs text-muted">api.mainnet.cipherscan.app</code>) and{' '}
              <code className="text-cipher-cyan">testnet</code> ({' '}
              <code className="text-xs text-muted">api.testnet.cipherscan.app</code>).
              The base URL above reflects the network you are currently viewing.
            </p>
            <p>
              <strong className="text-primary">Rate Limiting:</strong> If you exceed 100 requests per minute,
              you&apos;ll receive a <code className="text-danger">429 Too Many Requests</code> response.
            </p>
            <p>
              <strong className="text-primary">Values:</strong> Monetary amounts in responses are in{' '}
              <strong className="text-primary">zatoshis</strong> (1 ZEC = 100,000,000 zatoshis) unless otherwise noted.
              Some endpoints return both ZEC and zatoshi values.
            </p>
          </div>
        </div>

        {/* Endpoints by category */}
        <div className="space-y-12">
          {categories.map((category) => (
            <section key={category.name} className="space-y-6">
              <div className="sticky top-16 docs-category-header backdrop-blur py-4 z-10 border-b border-cipher-border flex items-center justify-between">
                <h2 className="text-2xl sm:text-3xl font-bold font-mono text-primary">
                  {category.name}
                </h2>
                <span className="text-xs text-muted font-mono">
                  {category.endpoints.length} endpoint{category.endpoints.length !== 1 ? 's' : ''}
                </span>
              </div>
              {category.endpoints.map((endpoint) => (
                <ApiEndpoint key={endpoint.id} endpoint={endpoint} />
              ))}
            </section>
          ))}
        </div>

        {/* Code Examples */}
        <div className="mt-12 card">
          <h2 className="text-2xl font-bold mb-6 text-primary">Code Examples</h2>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-cipher-cyan mb-3 font-mono">JavaScript / Node.js</h3>
            <div className="docs-code-block border border-cipher-border rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm text-secondary font-mono">
{`const BASE = '${baseUrl}';

// Latest blocks
const blocks = await fetch(BASE + '/api/blocks?limit=5');
console.log(await blocks.json());

// Privacy stats
const stats = await fetch(BASE + '/api/privacy-stats');
const { metrics } = await stats.json();
console.log('Privacy score:', metrics.privacyScore);

// Blend check — how common is 1 ZEC?
const blend = await fetch(BASE + '/api/blend-check?amount=1.0');
console.log(await blend.json());`}
              </pre>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-cipher-cyan mb-3 font-mono">Python</h3>
            <div className="docs-code-block border border-cipher-border rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm text-secondary font-mono">
{`import requests

BASE = '${baseUrl}'

# Circulating supply
supply = requests.get(f'{BASE}/api/circulating-supply?format=json').json()
print(f"Circulating: {supply['circulatingSupply']} ZEC")

# Rich list top 10
rich = requests.get(f'{BASE}/api/rich-list?limit=10').json()
for addr in rich['addresses']:
    label = addr.get('label', 'Unknown')
    print(f"#{addr['rank']} {label}: {addr['balance'] / 1e8:.2f} ZEC")

# Mempool
mempool = requests.get(f'{BASE}/api/mempool').json()
print(f"Pending: {mempool['count']} txs ({mempool['stats']['shieldedPercentage']}% shielded)")`}
              </pre>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold text-cipher-cyan mb-3 font-mono">cURL</h3>
            <div className="docs-code-block border border-cipher-border rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm text-secondary font-mono">
{`# Halving countdown
curl ${baseUrl}/api/network/halving

# Cross-chain swap volume
curl ${baseUrl}/api/crosschain/stats

# Shielded transaction count since 2025
curl '${baseUrl}/api/stats/shielded-count?since=2025-01-01&detailed=true'`}
              </pre>
            </div>
          </div>
        </div>

        {/* Error Responses */}
        <div className="mt-12 card">
          <h2 className="text-2xl font-bold mb-6 text-primary">Error Responses</h2>
          <div className="space-y-4 text-sm">
            <div className="flex gap-4 items-start">
              <code className="text-cipher-green font-mono shrink-0 w-12">200</code>
              <span className="text-secondary">Success. Response body contains the requested data.</span>
            </div>
            <div className="flex gap-4 items-start">
              <code className="text-cipher-yellow font-mono shrink-0 w-12">400</code>
              <span className="text-secondary">Bad request. Invalid parameters (e.g., non-numeric block height, missing required param).</span>
            </div>
            <div className="flex gap-4 items-start">
              <code className="text-cipher-yellow font-mono shrink-0 w-12">404</code>
              <span className="text-secondary">Not found. The requested block, transaction, address, or name does not exist.</span>
            </div>
            <div className="flex gap-4 items-start">
              <code className="text-danger font-mono shrink-0 w-12">429</code>
              <span className="text-secondary">Rate limit exceeded. Wait and retry. Limit: 100 requests per minute per IP.</span>
            </div>
            <div className="flex gap-4 items-start">
              <code className="text-danger font-mono shrink-0 w-12">500</code>
              <span className="text-secondary">Server error. The node or database may be temporarily unavailable.</span>
            </div>
          </div>
        </div>

        {/* Support */}
        <div className="mt-12 card">
          <h2 className="text-xl font-bold mb-4 text-primary">Need Help?</h2>
          <p className="text-secondary mb-4">
            If you have questions or need support, feel free to reach out:
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href="https://github.com/Kenbak/cipherscan"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 card-bg border border-cipher-border rounded-lg hover:border-cipher-cyan transition-colors text-sm text-secondary"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              GitHub
            </a>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 bg-cipher-cyan text-cipher-bg rounded-lg hover:bg-cipher-green transition-colors text-sm font-bold"
            >
              Explore the Blockchain →
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
