'use client';

import Link from 'next/link';
import ApiSidebar from './components/ApiSidebar';
import ApiEndpoint from './components/ApiEndpoint';
import { getEndpoints, getEndpointsByCategory } from './endpoints';
import { getApiUrl } from '@/lib/api-config';

export default function DocsPage() {
  // Use the appropriate API URL based on network
  const baseUrl = getApiUrl();

  const categories = getEndpointsByCategory(baseUrl);
  const endpoints = getEndpoints(baseUrl);

  return (
    <div className="min-h-screen bg-cipher-bg text-white flex">
      {/* Sidebar */}
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

      {/* Main content */}
      <main className="flex-1 py-12 px-4 lg:px-12 max-w-5xl">
        {/* Header */}
        <div className="mb-12">
          <Link href="/" className="text-cipher-cyan hover:text-cipher-green transition-colors text-sm font-mono mb-4 inline-block">
            ← Back to Explorer
          </Link>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 font-mono">
            📚 API Documentation
          </h1>
          <p className="text-base sm:text-lg text-gray-400 max-w-3xl">
            Free, open API for accessing Zcash testnet blockchain data. No authentication required.
          </p>
        </div>

        {/* Quick Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          <div className="card">
            <div className="text-sm text-gray-400 mb-1">Base URL</div>
            <code className="text-xs sm:text-sm text-cipher-cyan break-all">{baseUrl}/api</code>
          </div>
          <div className="card">
            <div className="text-sm text-gray-400 mb-1">Rate Limit</div>
            <div className="text-lg sm:text-xl font-bold text-white">100 req/min</div>
            <div className="text-xs text-gray-500">Per IP address</div>
          </div>
          <div className="card">
            <div className="text-sm text-gray-400 mb-1">Authentication</div>
            <div className="text-lg sm:text-xl font-bold text-cipher-green">None Required</div>
            <div className="text-xs text-gray-500">Free & open</div>
          </div>
        </div>

        {/* Important Notes */}
        <div className="card bg-purple-900/20 border-purple-500/30 mb-12">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span>🛡️</span>
            Privacy & Limitations
          </h2>
          <div className="space-y-2 text-sm text-gray-300">
            <p>
              <strong className="text-white">Shielded Addresses:</strong> Due to Zcash's privacy features,
              shielded addresses (z-addresses) and their balances cannot be queried. Only transparent addresses
              (t-addresses) and unified addresses with transparent receivers are supported.
            </p>
            <p>
              <strong className="text-white">Testnet Only:</strong> This API currently serves Zcash testnet data.
              Mainnet API will be available at <code className="text-cipher-cyan">cipherscan.app/api</code>
            </p>
            <p>
              <strong className="text-white">Rate Limiting:</strong> If you exceed 100 requests per minute,
              you'll receive a <code className="text-red-400">429 Too Many Requests</code> response.
            </p>
          </div>
        </div>

        {/* Endpoints by category */}
        <div className="space-y-12">
          {categories.map((category) => (
            <section key={category.name} className="space-y-6">
              <h2 className="text-2xl sm:text-3xl font-bold font-mono sticky top-0 bg-cipher-bg/95 backdrop-blur py-4 z-10 border-b border-cipher-border">
                {category.name}
              </h2>
              {category.endpoints.map((endpoint) => (
                <ApiEndpoint key={endpoint.id} endpoint={endpoint} />
              ))}
            </section>
          ))}
        </div>

        {/* Code Examples */}
        <div className="mt-12 card">
          <h2 className="text-2xl font-bold mb-6">Code Examples</h2>

          {/* JavaScript */}
          <div className="mb-6">
            <h3 className="text-lg font-bold text-cipher-cyan mb-3 font-mono">JavaScript / Node.js</h3>
            <div className="bg-cipher-bg border border-cipher-border rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm text-gray-300 font-mono">
{`// Fetch block data
const response = await fetch('${baseUrl}/api/block/3667080');
const data = await response.json();
console.log(data);

// Fetch privacy stats
const stats = await fetch('${baseUrl}/api/privacy-stats');
const privacyData = await stats.json();
console.log(privacyData.metrics.privacyScore);`}
              </pre>
            </div>
          </div>

          {/* Python */}
          <div className="mb-6">
            <h3 className="text-lg font-bold text-cipher-cyan mb-3 font-mono">Python</h3>
            <div className="bg-cipher-bg border border-cipher-border rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm text-gray-300 font-mono">
{`import requests

# Fetch block data
response = requests.get('${baseUrl}/api/block/3667080')
data = response.json()
print(data)

# Fetch mempool
mempool = requests.get('${baseUrl}/api/mempool')
print(f"Pending transactions: {mempool.json()['count']}")`}
              </pre>
            </div>
          </div>
        </div>

        {/* Support */}
        <div className="mt-12 card-glass">
          <h2 className="text-xl font-bold mb-4">Need Help?</h2>
          <p className="text-gray-400 mb-4">
            If you have questions or need support, feel free to reach out:
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href="https://github.com/Kenbak/cipherscan"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-cipher-surface border border-cipher-border rounded-lg hover:border-cipher-cyan transition-colors text-sm"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
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
