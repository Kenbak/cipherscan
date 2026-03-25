'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getZnsClient } from '@/lib/zns';
import { isValidName } from 'zcashname-sdk';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import type { ResolveResult, StatusResult, EventsResult } from 'zcashname-sdk';

function truncateAddress(addr: string): string {
  if (addr.length <= 30) return addr;
  return `${addr.slice(0, 20)}...${addr.slice(-8)}`;
}

export default function NamePage() {
  const params = useParams();
  const name = params.name as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolveResult | null>(null);
  const [events, setEvents] = useState<EventsResult | null>(null);
  const [status, setStatus] = useState<StatusResult | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const valid = isValidName(name);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(label);
      setTimeout(() => setCopiedText(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const CopyButton = ({ text, label }: { text: string; label: string }) => (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        copyToClipboard(text, label);
      }}
      className="ml-2 p-1 text-muted hover:text-cipher-cyan transition-colors"
      title="Copy to clipboard"
    >
      {copiedText === label ? (
        <svg className="w-4 h-4 text-cipher-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );

  useEffect(() => {
    if (!valid) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchData() {
      try {
        const client = await getZnsClient();
        const [resolveResult, eventsResult, statusResult] = await Promise.all([
          client.resolve(name),
          client.events({ name }),
          client.status(),
        ]);

        if (cancelled) return;

        setResolved(resolveResult);
        setEvents(eventsResult);
        setStatus(statusResult);
      } catch (err) {
        if (cancelled) return;
        setError('Unable to reach ZNS indexer. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [name, valid]);

  // Loading
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="animate-pulse space-y-6">
          <div className="h-10 bg-cipher-surface rounded-lg w-48" />
          <div className="card"><div className="h-24 bg-cipher-hover rounded-lg" /></div>
          <div className="card"><div className="h-32 bg-cipher-hover rounded-lg" /></div>
        </div>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="card text-center py-8">
          <p className="text-sm text-cipher-text-secondary mb-4">{error}</p>
          <button
            onClick={() => { setError(null); setLoading(true); }}
            className="btn btn-sm btn-primary"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Invalid name
  if (!valid) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="flex items-center gap-4 mb-8">
          <h1 className="text-2xl sm:text-3xl font-mono font-bold break-all">{name}</h1>
          <Badge color="orange">INVALID</Badge>
        </div>
      </div>
    );
  }

  // Available name
  if (!resolved) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="flex items-center gap-4 mb-8">
          <h1 className="text-2xl sm:text-3xl font-mono font-bold break-all">{name}</h1>
          <Badge color="green">AVAILABLE</Badge>
        </div>
      </div>
    );
  }

  // Registered name
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="flex items-center gap-4 mb-8">
        <h1 className="text-2xl sm:text-3xl font-mono font-bold break-all">{name}</h1>
        <Badge color="cyan">REGISTERED</Badge>
      </div>

      {/* Resolved Address */}
      <Card className="mb-6">
        <h2 className="text-sm font-bold font-mono text-cipher-text-secondary mb-4 flex items-center gap-2">
          <span className="text-cipher-text-muted opacity-50">{'>'}</span>
          RESOLVED_ADDRESS
        </h2>
        <div className="flex items-center">
          <Link
            href={`/address/${resolved.address}`}
            className="font-mono text-sm text-cipher-cyan hover:underline break-all"
          >
            {truncateAddress(resolved.address)}
          </Link>
          <CopyButton text={resolved.address} label="address" />
        </div>
      </Card>
    </div>
  );
}
