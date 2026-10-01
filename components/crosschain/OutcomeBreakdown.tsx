"use client";
import { useState } from "react";
import { TokenChainIcon } from "@/components/TokenChainIcon";
import { Analytics, CHAINS, href } from "./model";
import { SwapFilterLink } from "./SwapFilterLink";
const OUTCOMES = [
  { status: "SUCCESS", label: "Completed", color: "var(--color-cipher-green)" },
  {
    status: "REFUNDED",
    label: "Refunded",
    color: "var(--color-cipher-orange)",
  },
  { status: "FAILED", label: "Failed", color: "var(--color-danger)" },
  {
    status: "PROCESSING",
    label: "Processing",
    color: "var(--color-cipher-gold)",
  },
  {
    status: "PENDING_DEPOSIT",
    label: "Awaiting deposit",
    color: "var(--color-text-muted)",
  },
  {
    status: "INCOMPLETE_DEPOSIT",
    label: "Incomplete deposit",
    color: "var(--color-text-secondary)",
  },
];
export function OutcomeBreakdown({ data }: { data: Analytics }) {
  const [all, setAll] = useState(false);
  const chains = Array.from(
    new Set((data.chainOutcomes || []).map((r) => r.chain)),
  )
    .map((chain) => {
      const counts = new Map(
        (data.chainOutcomes || [])
          .filter((r) => r.chain === chain)
          .map((r) => [r.status, r.count]),
      );
      return {
        chain,
        counts,
        total: Array.from(counts.values()).reduce((a, b) => a + b, 0),
      };
    })
    .sort((a, b) => b.total - a.total);
  return (
    <details className="border-t border-cipher-border pt-4">
      <summary className="text-xs text-secondary cursor-pointer">
        Breakdown by chain
      </summary>
      <div className="flex flex-wrap gap-3 text-xs text-muted my-4">
        {OUTCOMES.filter((o) =>
          data.coverage.statusesAvailable.includes(o.status),
        ).map((o) => (
          <span key={o.status}>
            <span style={{ color: o.color }}>■</span> {o.label}
          </span>
        ))}
      </div>
      <div className="space-y-3">
        {(all ? chains : chains.slice(0, 8)).map(({ chain, counts, total }) => (
          <div
            key={chain}
            className="grid grid-cols-[110px_1fr_55px] items-center gap-3 text-xs"
          >
            <span className="flex items-center gap-2 text-secondary">
              <TokenChainIcon token={chain} chain={chain} size={20} />
              {CHAINS[chain] || chain}
            </span>
            <div className="flex h-7 overflow-hidden rounded">
              {OUTCOMES.map((o) => {
                const n = counts.get(o.status) || 0;
                const label = `${CHAINS[chain] || chain} · ${o.label}: ${n.toLocaleString()} (${((100 * n) / total).toFixed(1)}%)`;
                return n ? (
                  <SwapFilterLink
                    key={o.status}
                    scrollToSwaps
                    href={
                      href({ period: data.period, chain, status: o.status }) +
                      "#swaps"
                    }
                    title={label}
                    aria-label={label}
                    style={{
                      width: `${(100 * n) / total}%`,
                      minWidth: 4,
                      backgroundColor: o.color,
                    }}
                    className="hover:opacity-75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cipher-gold"
                  />
                ) : null;
              })}
            </div>
            <span className="text-muted font-mono text-right">
              {total.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
      {!chains.length && (
        <p className="text-xs text-muted">No chain outcome data available.</p>
      )}
      {chains.length > 8 && (
        <button
          className="text-xs text-cipher-gold mt-3"
          onClick={() => setAll(!all)}
        >
          {all
            ? "Show fewer chains"
            : `Show ${chains.length - 8} more chains →`}
        </button>
      )}
      <p className="text-xs text-muted mt-4">
        Latest observed outcomes · select a segment to see swaps.
      </p>
      {data.coverage.statusesAvailable.length === 1 && (
        <p className="text-xs text-cipher-orange mt-2">
          Only successful swaps are indexed; other outcomes are unavailable.
        </p>
      )}
    </details>
  );
}
