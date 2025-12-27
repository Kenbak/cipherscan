'use client';

import { useState } from 'react';
import type { ApiEndpoint } from '../endpoints';

interface ApiEndpointProps {
  endpoint: ApiEndpoint;
}

export default function ApiEndpointComponent({ endpoint }: ApiEndpointProps) {
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);

  const copyToClipboard = (text: string, endpointId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedEndpoint(endpointId);
    setTimeout(() => setCopiedEndpoint(null), 2000);
  };

  return (
    <div id={endpoint.id} className="card scroll-mt-24">
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
      <p className="text-secondary mb-4">{endpoint.description}</p>

      {/* Note */}
      {endpoint.note && (
        <div className="warning-box rounded-lg p-3 mb-4 text-sm">
          <span className="warning-text">{endpoint.note}</span>
        </div>
      )}

      {/* Parameters */}
      {endpoint.params.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-bold text-muted mb-2 uppercase">Parameters</h4>
          <div className="space-y-2">
            {endpoint.params.map((param, i) => (
              <div key={i} className="flex flex-col sm:flex-row sm:items-start gap-2 text-sm">
                <code className="text-cipher-cyan font-mono">{param.name}</code>
                <span className="text-muted">({param.type})</span>
                <span className="text-secondary">- {param.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Example */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-bold text-muted uppercase">Example Request</h4>
          <button
            onClick={() => copyToClipboard(endpoint.example, endpoint.id)}
            className="text-xs text-cipher-cyan hover:text-cipher-green transition-colors flex items-center gap-1"
          >
            {copiedEndpoint === endpoint.id ? (
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
        <div className="docs-code-block border border-cipher-border rounded-lg p-3 overflow-x-auto">
          <code className="text-xs sm:text-sm text-secondary font-mono whitespace-pre">
            {endpoint.example}
          </code>
        </div>
      </div>

      {/* Response */}
      <div>
        <h4 className="text-sm font-bold text-muted mb-2 uppercase">Example Response</h4>
        <div className="docs-code-block border border-cipher-border rounded-lg p-3 overflow-x-auto">
          <pre className="text-xs sm:text-sm text-secondary font-mono">
            {JSON.stringify(endpoint.response, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
