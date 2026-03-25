'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getZnsClient } from '@/lib/zns';
import { isValidName } from 'zcashname-sdk';
import { Badge } from '@/components/ui/Badge';
import type { ResolveResult, StatusResult, EventsResult } from 'zcashname-sdk';

export default function NamePage() {
  const params = useParams();
  const name = params.name as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolveResult | null>(null);
  const [events, setEvents] = useState<EventsResult | null>(null);
  const [status, setStatus] = useState<StatusResult | null>(null);

  const valid = isValidName(name);

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
    </div>
  );
}
