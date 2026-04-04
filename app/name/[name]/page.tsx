'use client';

import { useParams, notFound } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { isValidName } from 'zcashname-sdk';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';

const EVENT_COLORS: Record<string, 'green' | 'orange' | 'cyan' | 'purple' | 'muted'> = {
  CLAIM: 'green',
  LIST: 'orange',
  BUY: 'cyan',
  UPDATE: 'purple',
  DELIST: 'muted',
};

function truncateAddress(addr: string): string {
  if (addr.length <= 30) return addr;
  return `${addr.slice(0, 20)}...${addr.slice(-8)}`;
}

export default function NamePage() {
  const params = useParams();
  const name = params.name as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<any>(null);
  const [events, setEvents] = useState<any>(null);
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
        const res = await fetch(`/api/name/${encodeURIComponent(name)}`);

        if (cancelled) return;

        if (res.status === 404) {
          setLoading(false);
          return;
        }

        if (!res.ok) {
          setError('Unable to reach ZNS indexer. Please try again.');
          setLoading(false);
          return;
        }

        setResolved(await res.json());

        // Events may fail — not critical
        try {
          const eventsRes = await fetch(`/api/name/${encodeURIComponent(name)}/events`);
          if (!cancelled && eventsRes.ok) {
            setEvents(await eventsRes.json());
          }
        } catch {}
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

  // Invalid name → 404
  if (!valid) notFound();

  // Name not registered → nothing on-chain to show
  if (!resolved) notFound();

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

      {/* Registration Details */}
      <Card className="mb-6">
        <h2 className="text-sm font-bold font-mono text-cipher-text-secondary mb-4 flex items-center gap-2">
          <span className="text-cipher-text-muted opacity-50">{'>'}</span>
          REGISTRATION
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-cipher-text-muted">Transaction</span>
            <div className="flex items-center">
              <Link href={`/tx/${resolved.txid}`} className="font-mono text-cipher-cyan hover:underline">
                {resolved.txid.slice(0, 16)}...
              </Link>
              <CopyButton text={resolved.txid} label="txid" />
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-cipher-text-muted">Block</span>
            <Link href={`/block/${resolved.height}`} className="font-mono text-cipher-cyan hover:underline">
              #{resolved.height.toLocaleString()}
            </Link>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-cipher-text-muted">Nonce</span>
            <span className="font-mono">{resolved.nonce}</span>
          </div>
        </div>
      </Card>

      {/* Marketplace */}
      <Card className="mb-6">
        <h2 className="text-sm font-bold font-mono text-cipher-text-secondary mb-4 flex items-center gap-2">
          <span className="text-cipher-text-muted opacity-50">{'>'}</span>
          MARKETPLACE
        </h2>
        {resolved.listing ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Badge color="orange">FOR SALE</Badge>
              <span className="text-lg font-mono font-bold text-cipher-yellow">
                {(resolved.listing.price / 1e8).toFixed(2)} ZEC
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-cipher-text-muted">Listing Tx</span>
              <div className="flex items-center">
                <Link href={`/tx/${resolved.listing.txid}`} className="font-mono text-cipher-cyan hover:underline">
                  {resolved.listing.txid.slice(0, 16)}...
                </Link>
                <CopyButton text={resolved.listing.txid} label="listing-txid" />
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-cipher-text-muted">Block</span>
              <Link href={`/block/${resolved.listing.height}`} className="font-mono text-cipher-cyan hover:underline">
                #{resolved.listing.height.toLocaleString()}
              </Link>
            </div>
          </div>
        ) : (
          <p className="text-sm text-cipher-text-muted">Not for sale</p>
        )}
      </Card>

      {/* Event History */}
      {events && events.events.length > 0 && (
        <Card>
          <h2 className="text-sm font-bold font-mono text-cipher-text-secondary mb-4 flex items-center gap-2">
            <span className="text-cipher-text-muted opacity-50">{'>'}</span>
            EVENT_HISTORY
          </h2>
          <div className="space-y-3">
            {events.events.map((event: any) => (
              <div key={event.id} className="flex items-center gap-3 text-sm flex-wrap">
                <Badge color={EVENT_COLORS[event.action] || 'muted'}>
                  {event.action}
                </Badge>
                <Link href={`/tx/${event.txid}`} className="font-mono text-cipher-cyan hover:underline">
                  {event.txid.slice(0, 12)}...
                </Link>
                <Link href={`/block/${event.height}`} className="font-mono text-cipher-text-muted hover:text-cipher-cyan">
                  #{event.height.toLocaleString()}
                </Link>
                {event.action === 'UPDATE' && event.ua && (
                  <span className="font-mono text-cipher-text-muted text-xs">
                    → {truncateAddress(event.ua)}
                  </span>
                )}
                {(event.action === 'LIST' || event.action === 'BUY') && event.price != null && (
                  <span className="font-mono text-cipher-yellow text-xs">
                    {(event.price / 1e8).toFixed(2)} ZEC
                  </span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
