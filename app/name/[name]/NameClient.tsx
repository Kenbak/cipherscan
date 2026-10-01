'use client';

import Link from 'next/link';
import { getApiUrl } from '@/lib/api-config';
import { readApiData } from '@/lib/api-client';
import { useState, useEffect } from 'react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { HashLink } from '@/components/ui/HashLink';
import { CopyButton } from '@/components/CopyButton';
import type { NameSnapshot, NameRegistration as Registration, NameEvent as Event, NamePricing as Pricing } from '@/lib/name-types';
import { fetchLiveResponse, startLiveRefresh } from '@/lib/live-refresh';
type EventAction = Event['action'];

const ZCASHNAMES_URL = 'https://www.zcashnames.com';

const ZATS_PER_ZEC = 100_000_000;
const formatZec = (zats: number): string =>
  `${(zats / ZATS_PER_ZEC).toLocaleString('en-US', { maximumFractionDigits: 8 })} ZEC`;

const ACTION_COLOR: Record<EventAction, 'green' | 'gold' | 'purple' | 'orange' | 'muted'> = {
  CLAIM: 'green',
  LIST: 'orange',
  SETPRICE: 'orange',
  BUY: 'gold',
  UPDATE: 'purple',
  DELIST: 'orange',
  RELEASE: 'muted',
};

export default function NameClient({ name, initialData }: { name: string; initialData: NameSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialData);
  const [refreshFailed, setRefreshFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const stop = startLiveRefresh(async () => {
      const [details, history] = await Promise.allSettled([
        fetchLiveResponse(`${getApiUrl()}/v1/names/${encodeURIComponent(name)}`, readApiData<Registration | { pricing: Pricing | null }>),
        fetchLiveResponse(`${getApiUrl()}/v1/names/${encodeURIComponent(name)}/events`, readApiData<any>),
      ]);
      if (!active) return;
      if (details.status === 'fulfilled') {
        const data = details.value;
        if (data && 'address' in data && typeof data.address === 'string') {
          setSnapshot({ state: 'registered', registration: data,
            events: history.status === 'fulfilled' && Array.isArray(history.value?.events)
              ? history.value.events : null });
          setRefreshFailed(false);
        } else if (data && 'pricing' in data) {
          setSnapshot({ state: 'available', pricing: data.pricing });
          setRefreshFailed(false);
        } else setRefreshFailed(true);
      } else setRefreshFailed(true);
    }, 60_000);
    return () => { active = false; stop(); };
  }, [name]);

  // A blocked/failed browser request must not erase successfully rendered data.
  return (
    <>
      {refreshFailed && snapshot.state !== 'error' && (
        <p role="status" className="container mx-auto px-4 pt-4 max-w-4xl text-sm text-muted">
          Live refresh is unavailable. Showing the last successful lookup; reload to check the latest status.
        </p>
      )}
      {snapshot.state === 'registered' ? (
        <RegisteredView name={name} registration={snapshot.registration} events={snapshot.events} CopyButton={CopyButton} />
      ) : snapshot.state === 'available' ? (
        <AvailableView name={name} pricing={snapshot.pricing} CopyButton={CopyButton} />
      ) : (
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <Card><CardBody><p className="text-secondary">Name data is temporarily unavailable. Please try again shortly.</p></CardBody></Card>
        </div>
      )}
    </>
  );
}

function RegisteredView({
  name,
  registration,
  events,
  CopyButton,
}: {
  name: string;
  registration: Registration;
  events: Event[] | null;
  CopyButton: ({ text, label }: { text: string; label: string }) => React.ReactElement;
}) {

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-3xl font-mono">{name}</h2>
            <div className="flex gap-2">
              <Badge color={ACTION_COLOR[registration.lastAction]}>
                {registration.lastAction}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <Field label="Resolves to">
            <div className="flex items-center">
              <Link
                href={`/address/${registration.address}`}
                className="font-mono text-sm hover:text-primary transition-colors break-all"
              >
                {registration.address}
              </Link>
              <CopyButton text={registration.address} label="address" />
            </div>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Last action</h2>
        </CardHeader>
        <CardBody>
          <Field label="Transaction">
            <HashLink value={registration.txid} href={`/tx/${registration.txid}`} />
          </Field>
          <Field label="Block">
            <div className="flex items-center">
              <Link
                href={`/block/${registration.height}`}
                className="font-mono text-sm hover:text-primary transition-colors"
              >
                {registration.height.toLocaleString('en-US')}
              </Link>
              <CopyButton text={registration.height.toString()} label="block" />
            </div>
          </Field>
        </CardBody>
      </Card>

      {registration.listing && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Listed for sale</h2>
              <Badge color="orange">FOR SALE</Badge>
            </div>
          </CardHeader>
          <CardBody>
            <Field label="Price">
              <span className="font-mono text-lg">{formatZec(registration.listing.price)}</span>
            </Field>
            <a
              href={ZCASHNAMES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-3 px-4 py-2 rounded bg-brand-gold/20 border border-cipher-gold/40 text-cipher-gold hover:bg-brand-gold/30 transition-colors"
            >
              Buy on zcashnames.com →
            </a>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">History{events ? ` (${events.length})` : ''}</h2>
        </CardHeader>
        <CardBody>
          {events === null ? (
            <p className="text-muted text-sm">History is temporarily unavailable.</p>
          ) : events.length === 0 ? (
            <p className="text-muted text-sm">No events.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-white/10">
                    <th className="py-2 pr-4">Action</th>
                    <th className="py-2 pr-4">Block</th>
                    <th className="py-2 pr-4">Tx</th>
                    <th className="py-2">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} className="border-b border-white/5">
                      <td className="py-2 pr-4">
                        <Badge color={ACTION_COLOR[e.action]}>{e.action}</Badge>
                      </td>
                      <td className="py-2 pr-4 font-mono">
                        <Link
                          href={`/block/${e.height}`}
                          className="hover:text-primary transition-colors"
                        >
                          {e.height.toLocaleString('en-US')}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 font-mono">
                        <HashLink value={e.txid} href={`/tx/${e.txid}`} copy={false} />
                      </td>
                      <td className="py-2 font-mono">
                        {e.price != null ? formatZec(e.price) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function AvailableView({
  name,
  pricing,
  CopyButton,
}: {
  name: string;
  pricing: Pricing | null;
  CopyButton: ({ text, label }: { text: string; label: string }) => React.ReactElement;
}) {
  const cost = pricing ? calculateClaimCost(name.length, pricing) : null;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-3xl font-mono">{name}</h2>
            <Badge color="green">AVAILABLE</Badge>
          </div>
        </CardHeader>
        <CardBody>
          {cost != null && (
            <Field label={`Claim cost (${name.length}-char name)`}>
              <span className="font-mono text-lg">{formatZec(cost)}</span>
            </Field>
          )}
          <a
            href={ZCASHNAMES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-3 px-4 py-2 rounded bg-brand-gold/20 border border-cipher-gold/40 text-cipher-gold hover:bg-brand-gold/30 transition-colors"
          >
            Claim on zcashnames.com →
          </a>
        </CardBody>
      </Card>

      {pricing && pricing.tiers.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Pricing tiers</h2>
          </CardHeader>
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-white/10">
                    <th className="py-2 pr-4">Length</th>
                    <th className="py-2">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {pricing.tiers.map((zats: number, i: number) => {
                    const isLast = i === pricing.tiers.length - 1;
                    const label = isLast ? `${i + 1}+` : `${i + 1}`;
                    return (
                      <tr
                        key={i}
                        className={`border-b border-white/5 ${i + 1 === name.length || (isLast && name.length > i + 1) ? 'text-cipher-gold' : ''}`}
                      >
                        <td className="py-2 pr-4 font-mono">{label} chars</td>
                        <td className="py-2 font-mono">{formatZec(zats)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function calculateClaimCost(nameLength: number, pricing: Pricing): number {
  const lastTier = pricing.tiers[pricing.tiers.length - 1];
  if (nameLength >= pricing.tiers.length) {
    return lastTier;
  }
  return pricing.tiers[nameLength - 1] || lastTier;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
      <span className="text-muted text-sm sm:w-48 shrink-0">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}
