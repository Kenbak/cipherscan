'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function DocsPage() {
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);

  const copyToClipboard = (text: string, endpoint: string) => {
    navigator.clipboard.writeText(text);
    setCopiedEndpoint(endpoint);
    setTimeout(() => setCopiedEndpoint(null), 2000);
  };

  // Use the PostgreSQL API for testnet (fast, indexed)
  const baseUrl = typeof window !== 'undefined' 
    ? (window.location.hostname.includes('testnet') ? 'https://api.testnet.cipherscan.app' : window.location.origin)
    : 'https://api.testnet.cipherscan.app';

  const endpoints = [
    {
      method: 'GET',
      path: '/api/block/:height',
      description: 'Get detailed information about a specific block by height',
      params: [
        { name: 'height', type: 'number', description: 'Block height (e.g., 3667080)' }
      ],
      example: `curl ${baseUrl}/api/block/3667080`,
      response: {
        height: 3667080,
        hash: '0000000...',
        timestamp: 1699123456,
        transactions: [],
        transactionCount: 2,
        size: 1234,
        difficulty: 1.0,
        confirmations: 5,
        previousBlockHash: '0000000...',
        nextBlockHash: '0000000...',
        version: 4,
        merkleRoot: '...',
        finalSaplingRoot: '...'
      }
    },
    {
      method: 'GET',
      path: '/api/tx/:txid',
      description: 'Get detailed information about a specific transaction',
      params: [
        { name: 'txid', type: 'string', description: 'Transaction ID (hash)' }
      ],
      example: `curl ${baseUrl}/api/tx/abc123...`,
      response: {
        txid: 'abc123...',
        blockHeight: 3667080,
        blockHash: '0000000...',
        timestamp: 1699123456,
        confirmations: 5,
        inputs: [],
        outputs: [],
        totalInput: 0,
        totalOutput: 0,
        fee: 0,
        size: 250,
        shieldedSpends: 0,
        shieldedOutputs: 0,
        orchardActions: 0,
        hasShieldedData: false
      }
    },
    {
      method: 'GET',
      path: '/api/address/:address',
      description: 'Get balance and transaction history for an address (transparent only)',
      params: [
        { name: 'address', type: 'string', description: 'Zcash address (t-address or unified address with transparent receiver)' }
      ],
      example: `curl ${baseUrl}/api/address/t1abc...`,
      response: {
        address: 't1abc...',
        type: 'transparent',
        balance: 123.456,
        transactionCount: 42,
        transactions: [
          {
            txid: 'abc...',
            timestamp: 1699123456,
            amount: 10.5,
            type: 'received',
            blockHeight: 3667080,
            from: 't1xyz...',
            to: 't1abc...'
          }
        ]
      },
      note: '⚠️ Shielded addresses (z-addresses) cannot be queried due to privacy. Unified addresses must have a transparent receiver.'
    },
    {
      method: 'GET',
      path: '/api/blocks',
      description: 'Get a list of recent blocks with pagination',
      params: [
        { name: 'limit', type: 'number', description: 'Number of blocks to return (default: 50, max: 100)' },
        { name: 'offset', type: 'number', description: 'Number of blocks to skip (default: 0)' }
      ],
      example: `curl '${baseUrl}/api/blocks?limit=10&offset=0'`,
      response: {
        blocks: [
          {
            height: 3667080,
            hash: '0000000...',
            timestamp: 1699123456,
            transaction_count: 2,
            size: 1234,
            difficulty: '41.58',
            total_fees: '0'
          }
        ],
        pagination: {
          limit: 10,
          offset: 0,
          total: 3667080,
          hasMore: true
        }
      }
    },
    {
      method: 'GET',
      path: '/api/mempool',
      description: 'Get current mempool status and pending transactions',
      params: [],
      example: `curl ${baseUrl}/api/mempool`,
      response: {
        count: 5,
        showing: 5,
        transactions: [
          {
            txid: 'abc...',
            type: 'shielded',
            vin: 1,
            vout: 2,
            saplingSpends: 1,
            saplingOutputs: 2,
            orchardActions: 0,
            size: 2500,
            time: 1699123456
          }
        ],
        stats: {
          total: 5,
          shielded: 2,
          transparent: 3,
          shieldedPercentage: 40
        }
      }
    },
    {
      method: 'GET',
      path: '/api/privacy-stats',
      description: 'Get blockchain-wide privacy statistics (shielded adoption, pool size, privacy score)',
      params: [],
      example: `curl ${baseUrl}/api/privacy-stats`,
      response: {
        success: true,
        data: {
          version: '1.0',
          lastUpdated: '2025-11-07T11:00:02.366Z',
          lastBlockScanned: 3667080,
          totals: {
            blocks: 3667080,
            shieldedTx: 91639,
            transparentTx: 467611,
            mixedTx: 79075,
            fullyShieldedTx: 12564
          },
          shieldedPool: {
            currentSize: 1563095.76,
            saplingPool: 1461270.64,
            orchardPool: 101825.11
          },
          metrics: {
            shieldedPercentage: 16.4,
            privacyScore: 11,
            adoptionTrend: 'stable'
          }
        }
      }
    }
  ];

  return (
    <div className="min-h-screen bg-cipher-bg text-white py-12 px-4">
      <div className="max-w-6xl mx-auto">

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
            <div className="text-lg sm:text-xl font-bold text-white">300 req/min</div>
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
              <strong className="text-white">Rate Limiting:</strong> If you exceed 300 requests per minute,
              you'll receive a <code className="text-red-400">429 Too Many Requests</code> response.
            </p>
          </div>
        </div>

        {/* Endpoints */}
        <div className="space-y-8">
          <h2 className="text-2xl sm:text-3xl font-bold font-mono mb-6">Endpoints</h2>

          {endpoints.map((endpoint, index) => (
            <div key={index} className="card">
              {/* Method & Path */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                <span className={`inline-block px-3 py-1 rounded font-mono text-sm font-bold ${
                  endpoint.method === 'GET' ? 'bg-cipher-green text-cipher-bg' : 'bg-cipher-cyan text-cipher-bg'
                }`}>
                  {endpoint.method}
                </span>
                <code className="text-base sm:text-lg text-cipher-cyan font-mono break-all">
                  {endpoint.path}
                </code>
              </div>

              {/* Description */}
              <p className="text-gray-300 mb-4">{endpoint.description}</p>

              {/* Note */}
              {endpoint.note && (
                <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3 mb-4 text-sm text-yellow-200">
                  {endpoint.note}
                </div>
              )}

              {/* Parameters */}
              {endpoint.params.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-bold text-gray-400 mb-2 uppercase">Parameters</h4>
                  <div className="space-y-2">
                    {endpoint.params.map((param, i) => (
                      <div key={i} className="flex flex-col sm:flex-row sm:items-start gap-2 text-sm">
                        <code className="text-cipher-cyan font-mono">{param.name}</code>
                        <span className="text-gray-500">({param.type})</span>
                        <span className="text-gray-400">- {param.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Example */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-bold text-gray-400 uppercase">Example Request</h4>
                  <button
                    onClick={() => copyToClipboard(endpoint.example, endpoint.path)}
                    className="text-xs text-cipher-cyan hover:text-cipher-green transition-colors flex items-center gap-1"
                  >
                    {copiedEndpoint === endpoint.path ? (
                      <>✓ Copied!</>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-cipher-bg border border-cipher-border rounded-lg p-3 overflow-x-auto">
                  <code className="text-xs sm:text-sm text-gray-300 font-mono whitespace-pre">
                    {endpoint.example}
                  </code>
                </div>
              </div>

              {/* Response */}
              <div>
                <h4 className="text-sm font-bold text-gray-400 mb-2 uppercase">Example Response</h4>
                <div className="bg-cipher-bg border border-cipher-border rounded-lg p-3 overflow-x-auto">
                  <pre className="text-xs sm:text-sm text-gray-300 font-mono">
                    {JSON.stringify(endpoint.response, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
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
console.log(privacyData.data.metrics.privacyScore);`}
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
        <div className="mt-12 card bg-cipher-surface/50">
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

      </div>
    </div>
  );
}
