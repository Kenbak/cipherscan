import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { getClient, isValidName } from '@/lib/zns';
import type { Event, EventAction, Registration, Pricing } from 'zcashname-sdk';

const ZCASHNAMES_URL = 'https://zcashnames.com';

const ZATS_PER_ZEC = 100_000_000;
const formatZec = (zats: number): string =>
  `${(zats / ZATS_PER_ZEC).toLocaleString(undefined, { maximumFractionDigits: 8 })} ZEC`;

const truncate = (s: string): string =>
  s.length > 20 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s;

const ACTION_COLOR: Record<EventAction, 'green' | 'cyan' | 'purple' | 'orange' | 'muted'> = {
  CLAIM: 'green',
  LIST: 'orange',
  SETPRICE: 'orange',
  BUY: 'cyan',
  UPDATE: 'purple',
  DELIST: 'orange',
  RELEASE: 'muted',
};

export default async function NamePage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name: raw } = await params;
  const name = decodeURIComponent(raw).toLowerCase();

  if (!isValidName(name)) notFound();

  const zns = getClient();
  const registration = await zns.resolveName(name);

  if (!registration) {
    const status = await zns.status();
    return <AvailableView name={name} pricing={status.pricing} />;
  }

  const eventsResult = await zns.events({ name, limit: 50 });
  return (
    <RegisteredView name={name} registration={registration} events={eventsResult.events} />
  );
}

function RegisteredView({
  name,
  registration,
  events,
}: {
  name: string;
  registration: Registration;
  events: Event[];
}) {
  const custody = registration.pubkey ? 'Sovereign' : 'Admin-registered';

  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h1 className="text-3xl font-mono">{name}</h1>
            <div className="flex gap-2">
              <Badge color={ACTION_COLOR[registration.last_action]}>
                {registration.last_action}
              </Badge>
              <Badge color={registration.pubkey ? 'purple' : 'muted'}>{custody}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <Field label="Resolves to">
            <Link
              href={`/address/${registration.address}`}
              className="font-mono text-sm hover:text-cipher-cyan transition-colors break-all"
            >
              {registration.address}
            </Link>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Last action</h2>
        </CardHeader>
        <CardBody>
          <Field label="Transaction">
            <Link
              href={`/tx/${registration.txid}`}
              className="font-mono text-sm hover:text-cipher-cyan transition-colors"
            >
              {truncate(registration.txid)}
            </Link>
          </Field>
          <Field label="Block">
            <Link
              href={`/block/${registration.height}`}
              className="font-mono text-sm hover:text-cipher-cyan transition-colors"
            >
              {registration.height.toLocaleString()}
            </Link>
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
              className="inline-block mt-3 px-4 py-2 rounded bg-cipher-cyan/20 border border-cipher-cyan/40 text-cipher-cyan hover:bg-cipher-cyan/30 transition-colors"
            >
              Buy on zcashnames.com →
            </a>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">History ({events.length})</h2>
        </CardHeader>
        <CardBody>
          {events.length === 0 ? (
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
                          className="hover:text-cipher-cyan transition-colors"
                        >
                          {e.height.toLocaleString()}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 font-mono">
                        <Link
                          href={`/tx/${e.txid}`}
                          className="hover:text-cipher-cyan transition-colors"
                        >
                          {truncate(e.txid)}
                        </Link>
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
    </main>
  );
}

function AvailableView({
  name,
  pricing,
}: {
  name: string;
  pricing: Pricing | null;
}) {
  const cost = pricing ? getClient().claimCost(name.length, pricing) : null;

  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h1 className="text-3xl font-mono">{name}</h1>
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
            className="inline-block mt-3 px-4 py-2 rounded bg-cipher-cyan/20 border border-cipher-cyan/40 text-cipher-cyan hover:bg-cipher-cyan/30 transition-colors"
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
                  {pricing.tiers.map((zats, i) => {
                    const isLast = i === pricing.tiers.length - 1;
                    const label = isLast ? `${i + 1}+` : `${i + 1}`;
                    return (
                      <tr
                        key={i}
                        className={`border-b border-white/5 ${i + 1 === name.length || (isLast && name.length > i + 1) ? 'text-cipher-cyan' : ''}`}
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
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
      <span className="text-muted text-sm sm:w-48 shrink-0">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}
