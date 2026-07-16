'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

export interface NodeClientCount {
  client: string;
  count: number;
}

export interface NodeClientVersion {
  client: string;
  version: string;
  count: number;
}

export interface NodeClientStats {
  observedNodes: number;
  identifiedNodes: number;
  coveragePercentage: number;
  distribution: NodeClientCount[];
  versions: NodeClientVersion[];
}

const CLIENT_COLORS: Record<string, string> = {
  Zebra: '#56D4C8',
  Zakura: '#E8C48D',
  zcashd: '#5B9CF6',
  Seeder: '#9B8AFB',
  Other: '#7D8A9A',
  Unknown: '#4B5563',
};

function clientColor(client: string) {
  return CLIENT_COLORS[client] || CLIENT_COLORS.Other;
}

export function NodeClientDistribution({ clients }: { clients: NodeClientStats }) {
  const distribution = clients.distribution.filter((item) => item.count > 0);

  if (clients.observedNodes === 0 || distribution.length === 0) {
    return (
      <div className="rounded-xl border border-cipher-border bg-cipher-bg/40 p-5">
        <h3 className="text-sm font-semibold text-primary">Observed peer software</h3>
        <p className="mt-2 text-xs text-muted">
          Client metadata will appear after the next successful peer observation.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-cipher-border bg-cipher-bg/40 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-primary">Observed peer software</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              Direct peers connected to CipherScan. This is a sample, not a complete network census.
            </p>
          </div>
          <span className="shrink-0 font-mono text-xs text-cipher-cyan">
            {clients.coveragePercentage}% identified
          </span>
        </div>

        <div className="mt-3 grid items-center gap-3 sm:grid-cols-[180px_1fr]">
          <div
            className="h-[180px]"
            role="img"
            aria-label={`Node implementation distribution across ${clients.observedNodes} observed peers`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={distribution}
                  dataKey="count"
                  nameKey="client"
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={74}
                  paddingAngle={2}
                  stroke="none"
                >
                  {distribution.map((item) => (
                    <Cell key={item.client} fill={clientColor(item.client)} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [`${Number(value)} peers`, String(name)]}
                  contentStyle={{
                    background: 'var(--color-surface-solid)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-2">
            {distribution.map((item) => {
              const percentage = clients.observedNodes > 0
                ? (item.count / clients.observedNodes) * 100
                : 0;
              return (
                <div key={item.client} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: clientColor(item.client) }}
                    aria-hidden="true"
                  />
                  <span className="min-w-16 text-secondary">{item.client}</span>
                  <span className="font-mono font-semibold text-primary">{item.count}</span>
                  <span className="ml-auto font-mono text-muted">{percentage.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-cipher-border bg-cipher-bg/40 p-5">
        <h3 className="text-sm font-semibold text-primary">Implementation versions</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          Versions self-reported by currently connected peers.
        </p>
        <div className="mt-4 space-y-2.5">
          {clients.versions.slice(0, 8).map((item) => (
            <div
              key={`${item.client}-${item.version}`}
              className="flex items-center gap-3 rounded-lg border border-cipher-border/60 px-3 py-2"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: clientColor(item.client) }}
                aria-hidden="true"
              />
              <span className="text-xs text-secondary">{item.client}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-primary">
                {item.version}
              </span>
              <span className="font-mono text-xs font-semibold text-cipher-cyan">{item.count}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
