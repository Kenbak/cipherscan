'use client';

import { useMemo, useState } from 'react';
import type { WalletStatus } from './types';

const WALLETS: { name: string; status: WalletStatus; detail: string; link: string | null }[] = [
  { name: 'Vizor', status: 'zip318', detail: 'First wallet with full ZIP-318 compliance — standard denominations, correct actions, boundary-aligned anchors', link: 'https://vizor.cash/' },
  { name: 'zcash_pool_migration', status: 'zip318', detail: 'Reference implementation of ZIP-318: canonical 1-2-5 denominations, boundary-aligned anchors, unpadded Ironwood bundles', link: 'https://docs.rs/zcash_pool_migration/latest/zcash_pool_migration/' },
  { name: 'Cake Wallet', status: 'ready', detail: 'Mostly ZIP-318 migration is live on current app stores; automatic mainnet migration is confirmed.', link: 'https://github.com/cake-tech/cake_wallet/releases' },
  { name: 'Zcash iOS SDK', status: 'ready', detail: 'PR #1812 merged. Integrates migration crate.', link: 'https://github.com/zcash/zcash-swift-wallet-sdk/pull/1812' },
  { name: 'Zcash Android SDK', status: 'ready', detail: 'feature-orchard_migration branch. Integrates migration crate.', link: null },
  { name: 'ZODL (iOS)', status: 'ready', detail: 'Basic migration is live in v3.8.0; the private ZIP-318 flow is still in development.', link: 'https://zodl.com/' },
  { name: 'ZODL (Android)', status: 'ready', detail: 'Basic migration is live in v3.8.0; the private ZIP-318 flow is still in development.', link: 'https://zodl.com/' },
  { name: 'Zkool (Desktop)', status: 'ready', detail: 'Private migration, not ZIP-318: separate splitting and migration phases, privacy-first note selection, and a speed slider. Confirmed on mainnet in v6.25.1.', link: 'https://github.com/hhanh00/zkool2/releases' },
  { name: 'Zkool (Android)', status: 'ready', detail: 'Private migration is available in Google Play v6.25.1.', link: 'https://github.com/hhanh00/zkool2/releases' },
  { name: 'Zkool (iOS)', status: 'in_progress', detail: 'App Store v6.23.0 predates Ironwood support; awaiting a current release.', link: 'https://github.com/hhanh00/zkool2/releases' },
  { name: 'Brave', status: 'unknown', detail: 'No Ironwood migration support announced yet', link: null },
  { name: 'Edge', status: 'unknown', detail: 'Uses librustzcash SDK — depends on SDK integration', link: null },
];

const WALLET_STATUS_ORDER: WalletStatus[] = ['zip318', 'ready', 'in_progress', 'unknown'];

const WALLET_STATUS_META: Record<
  WalletStatus,
  { dot: string; short: string; group: string; summary: string }
> = {
  zip318: { dot: 'bg-emerald-400', short: 'Compliant', group: 'ZIP-318 compliant', summary: 'compliant' },
  ready: { dot: 'bg-cyan-400', short: 'Ready', group: 'Migration ready', summary: 'ready' },
  in_progress: { dot: 'bg-amber-300', short: 'Waiting', group: 'Waiting on release', summary: 'waiting' },
  unknown: { dot: 'bg-muted/70', short: 'Unknown', group: 'Unknown', summary: 'unknown' },
};

export function WalletStatusBadge({ status }: { status: WalletStatus }) {
  const styles = {
    zip318: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
    ready: 'text-cyan-400 border-cyan-400/20 bg-cyan-400/5',
    in_progress: 'text-amber-300 border-amber-300/30 bg-amber-300/10',
    unknown: 'text-muted border-cipher-border/50 bg-glass-3',
  };
  const labels = { zip318: 'ZIP-318 Compliant', ready: 'Migration Ready', in_progress: 'Waiting on Release', unknown: 'Unknown' };
  return (
    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-mono ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export function WalletReadiness() {
  const [expanded, setExpanded] = useState<string | null>(null);

  const counts = useMemo(() => {
    const tally: Record<WalletStatus, number> = { zip318: 0, ready: 0, in_progress: 0, unknown: 0 };
    for (const w of WALLETS) tally[w.status]++;
    return tally;
  }, []);

  const summaryLine = WALLET_STATUS_ORDER
    .filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${WALLET_STATUS_META[s].summary}`)
    .join(' · ');

  return (
    <div className="mt-4 rounded-xl border border-cipher-border bg-cipher-surface p-4 sm:p-5">
      <h2 className="text-sm font-bold text-primary">Wallet readiness</h2>
      <p className="mt-1 text-xs text-muted sm:mb-4">
        Wallet support for Orchard → Ironwood migration and ZIP-318 compliance.
      </p>

      <p className="mb-3 text-[10px] font-mono text-muted sm:hidden">{summaryLine}</p>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-cipher-border/50 text-left text-[10px] font-mono uppercase tracking-wider text-muted">
              <th className="pb-2 pr-4">Wallet / SDK</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2">Detail</th>
            </tr>
          </thead>
          <tbody>
            {WALLETS.map((w) => (
              <tr key={w.name} className="border-b border-cipher-border/20 last:border-0">
                <td className="py-2.5 pr-4 font-mono text-primary">
                  {w.link ? (
                    <a href={w.link} target="_blank" rel="noopener" className="text-cipher-cyan hover:underline">{w.name}</a>
                  ) : w.name}
                </td>
                <td className="py-2.5 pr-4">
                  <WalletStatusBadge status={w.status} />
                </td>
                <td className="py-2.5 text-muted">{w.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile — grouped Settings-style list */}
      <div className="overflow-hidden rounded-lg border border-cipher-border/25 sm:hidden">
        {WALLET_STATUS_ORDER.map((status) => {
          const items = WALLETS.filter((w) => w.status === status);
          if (items.length === 0) return null;
          return (
            <div key={status}>
              <div className="border-b border-cipher-border/20 bg-glass-3/40 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-muted">
                {WALLET_STATUS_META[status].group}
              </div>
              <div className="divide-y divide-cipher-border/20">
                {items.map((w) => {
                  const isOpen = expanded === w.name;
                  const meta = WALLET_STATUS_META[w.status];
                  return (
                    <div key={w.name}>
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : w.name)}
                        className="flex w-full items-center gap-2.5 px-3 py-3 text-left transition-colors active:bg-cipher-hover"
                        aria-expanded={isOpen}
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-xs font-mono text-primary">{w.name}</span>
                        <span className="shrink-0 text-[10px] font-mono text-muted">{meta.short}</span>
                        <svg
                          className={`h-3.5 w-3.5 shrink-0 text-muted/50 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                          aria-hidden="true"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {isOpen ? (
                        <div className="border-t border-cipher-border/15 bg-glass-3/20 px-3 pb-3 pt-2">
                          <p className="text-[11px] leading-relaxed text-muted">{w.detail}</p>
                          {w.link ? (
                            <a
                              href={w.link}
                              target="_blank"
                              rel="noopener"
                              className="mt-2 inline-flex text-[11px] font-mono text-cipher-cyan hover:underline"
                            >
                              Open link →
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
