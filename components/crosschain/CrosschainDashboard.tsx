"use client";
import { useState } from "react";
import Link from "next/link";
import { useApiQuery } from "@/hooks/useApiQuery";
import { PageSectionNav } from "@/components/PageSectionNav";
import { ActivityCharts } from "./ActivityCharts";
import { SwapExplorer } from "./SwapExplorer";
import { WrappedZecTracker, WrappedZecAsset } from "./WrappedZecTracker";
import { Analytics, CHAINS, PERIODS, Unit, date, href, value } from "./model";
const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "routes", label: "Routes" },
  { id: "execution", label: "Outcomes & timing" },
  { id: "swaps", label: "Swap explorer" },
  { id: "ecosystem", label: "Ecosystem" },
];
export function CrosschainDashboard({
  params = {},
}: {
  params?: Record<string, string>;
}) {
  const [unit, setUnit] = useState<Unit>("usd");
  const [allRoutes, setAllRoutes] = useState(false);
  const period = params.period || "30d";
  const { data, loading, error, isRefreshing } = useApiQuery<Analytics>(
    "/v1/crosschain/analytics",
    { period },
    { refreshInterval: 120000 },
  );
  const wrapped = useApiQuery<{
    assets: WrappedZecAsset[];
    totalWrapped: number;
  }>("/v1/crosschain/wrapped-zec/supply", undefined, {
    refreshInterval: 300000,
  });
  const unitToggle = (
    <div className="filter-group" role="group" aria-label="Volume unit">
      {(["usd", "zec"] as const).map((u) => (
        <button
          key={u}
          onClick={() => setUnit(u)}
          aria-pressed={unit === u}
          className={`filter-btn ${unit === u ? "filter-btn-active" : ""}`}
        >
          {u.toUpperCase()}
        </button>
      ))}
    </div>
  );
  if (loading && !data)
    return (
      <div className="card min-h-[240px] text-muted" role="status">
        Loading indexed cross-chain activity…
      </div>
    );
  if (!data)
    return (
      <div className="card" role="alert">
        <h2 className="text-secondary">Cross-chain data unavailable</h2>
        <p className="text-sm text-muted mt-2">
          {error || "The analytics service has not returned a snapshot."}
        </p>
        <p className="text-sm text-muted mt-2">
          No zero-volume figures are inferred from an unavailable index.
        </p>
      </div>
    );
  const s = data.summary,
    c = data.coverage;
  const volume = s[`volume_${unit}`],
    inflow = s[`inflow_${unit}`],
    outflow = s[`outflow_${unit}`];
  const missing = unit === "usd" ? s.missing_usd : s.missing_zec;
  const metrics = [
    [
      "Observed volume",
      value(volume, unit),
      `${s.swaps.toLocaleString()} successful external swaps`,
    ],
    ["ZEC acquired", value(inflow, unit), "Destination asset is native ZEC"],
    ["ZEC exchanged", value(outflow, unit), "Source asset is native ZEC"],
    [
      "Median swap",
      value(s[`median_${unit}`], unit),
      `${s.sender_addresses.toLocaleString()} distinct source addresses`,
    ],
  ];
  const routes = allRoutes ? data.routes : data.routes.slice(0, 12);
  return (
    <div className="space-y-6" aria-busy={isRefreshing}>
      <PageSectionNav
        sections={SECTIONS}
        ariaLabel="Cross-chain sections"
        actions={unitToggle}
      />
      <section id="overview" className="space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <nav aria-label="Analytics period" className="filter-group flex-wrap">
            {PERIODS.map((p) => (
              <Link
                key={p}
                href={href({ period: p })}
                aria-current={period === p ? "page" : undefined}
                className={`filter-btn ${period === p ? "filter-btn-active" : ""}`}
              >
                {p.toUpperCase()}
              </Link>
            ))}
          </nav>
          <span className="text-xs text-muted font-mono">
            {date(data.start)} — {date(data.end)}
          </span>
        </div>
        <div className="rounded-lg border border-cipher-border p-4 text-xs text-muted space-y-2">
          <p>
            <span className="text-secondary">Indexed history:</span>{" "}
            {date(c.earliest)} → {date(c.latest)} · {c.records.toLocaleString()}{" "}
            records ·{" "}
            {c.historyTraversalComplete
              ? "Historical API traversal complete"
              : "Historical coverage incomplete / unverified"}
          </p>
          <p>
            <span className="text-secondary">Synced through:</span>{" "}
            {date(c.syncedThrough)} ·{" "}
            <span className={c.stale || error ? "text-cipher-orange" : ""}>
              {error
                ? "Refresh failed; showing last snapshot"
                : c.stale
                  ? "Stale or unverified"
                  : "Recent sync"}
            </span>{" "}
            · {c.missingZecHash.toLocaleString()} records without a reported ZEC
            transaction hash.
          </p>
          {c.source === "near-explorer-v2" && (
            <p>
              Continuous historical traversal through{" "}
              {date(c.continuousThrough)}. Unverified intervals remain gaps.
            </p>
          )}
          {c.source === "legacy-success-index" && (
            <p>
              This dataset contains successful swaps only. Failure, refund and
              pending records are not indexed yet; those counts are unavailable
              here.
            </p>
          )}
          {missing > 0 && (
            <p className="text-cipher-orange">
              {missing.toLocaleString()} successful swaps have no{" "}
              {unit.toUpperCase()} valuation. Totals cover the reported values
              only.
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {metrics.map(([label, v, hint]) => (
            <div key={label} className="card">
              <p className="text-caption text-muted uppercase font-mono">
                {label}
              </p>
              <p className="text-2xl sm:text-3xl text-primary font-mono tabular-nums mt-2 break-words">
                {v}
              </p>
              <p className="text-xs text-muted mt-2">{hint}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">
          {unit === "zec"
            ? "ZEC uses actual reported swap amounts, never conversion at today’s price."
            : "USD uses the reported source-side valuation."}{" "}
          Swaps of ZEC-backed tokens on other chains retain their own chain
          identity. Direction follows the asset route; an Intents-balance trade
          does not itself prove an on-chain deposit or withdrawal.
        </p>
        <ActivityCharts data={data} unit={unit} />
      </section>
      <section id="routes" className="card space-y-4">
        <div className="flex justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-sm text-secondary font-mono">Routes</h2>
            <p className="text-xs text-muted mt-2">
              Successful swaps, grouped by exact asset identifiers. Sorted by
              count; up to 100 routes.
            </p>
          </div>
          <button
            onClick={() => setAllRoutes(!allRoutes)}
            className="filter-btn"
          >
            {allRoutes ? "Show top 12" : "Show all routes"}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-muted">
              <tr>
                {[
                  "Route",
                  "Direction",
                  "Swaps",
                  `Volume · ${unit.toUpperCase()}`,
                  `Median · ${unit.toUpperCase()}`,
                  "Explore",
                ].map((h) => (
                  <th
                    key={h}
                    className="py-3 px-2 font-normal whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {routes.map((r, i) => (
                <tr key={i} className="border-t border-cipher-border">
                  <td
                    className="py-3 px-2 min-w-[200px]"
                    title={`${r.source_asset || "Unknown asset"} → ${r.dest_asset || "Unknown asset"}`}
                  >
                    <span className="text-secondary">
                      {r.source_token}{" "}
                      <span className="text-muted">
                        {CHAINS[r.source_chain] || r.source_chain}
                      </span>{" "}
                      → {r.dest_token}{" "}
                      <span className="text-muted">
                        {CHAINS[r.dest_chain] || r.dest_chain}
                      </span>
                    </span>
                  </td>
                  <td
                    className={
                      r.direction === "inflow"
                        ? "text-cipher-green"
                        : "text-cipher-orange"
                    }
                  >
                    {r.direction === "inflow"
                      ? "ZEC acquired"
                      : "ZEC exchanged"}
                  </td>
                  <td className="px-2 font-mono">{r.swaps.toLocaleString()}</td>
                  <td className="px-2 font-mono whitespace-nowrap">
                    {value(r[`volume_${unit}`], unit)}
                  </td>
                  <td className="px-2 font-mono whitespace-nowrap">
                    {value(r[`median_${unit}`], unit)}
                  </td>
                  <td className="px-2">
                    <Link
                      className="text-cipher-gold"
                      href={
                        href({
                          period,
                          direction: r.direction,
                          chain:
                            r.direction === "inflow"
                              ? r.source_chain
                              : r.dest_chain,
                          token:
                            r.direction === "inflow"
                              ? r.source_token
                              : r.dest_token,
                          status: "SUCCESS",
                          sourceAsset: r.source_asset || "",
                          destAsset: r.dest_asset || "",
                        }) + "#swaps"
                      }
                    >
                      Swaps →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!routes.length && (
          <p className="text-muted text-sm">
            No indexed successful external routes in this period.
          </p>
        )}
      </section>
      <section id="execution" className="grid lg:grid-cols-2 gap-4">
        <div className="card space-y-4">
          <h2 className="text-sm text-secondary font-mono">
            Observed outcomes
          </h2>
          <p className="text-xs text-muted">
            Statuses of swaps created in the selected period, as last observed.
            These are counts in the index, not a guaranteed venue-wide success
            rate. Pending deposits can be unfunded quotes and are not failed
            trades.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              "SUCCESS",
              "REFUNDED",
              "FAILED",
              "PROCESSING",
              "PENDING_DEPOSIT",
              "INCOMPLETE_DEPOSIT",
            ].map((status) => (
              <div key={status}>
                <p className="text-caption text-muted break-words">
                  {status.replaceAll("_", " ")}
                </p>
                <p className="font-mono text-lg mt-1">
                  {c.statusesAvailable.includes(status)
                    ? (
                        data.statuses.find((s) => s.status === status)?.count ||
                        0
                      ).toLocaleString()
                    : "Unavailable"}
                </p>
              </div>
            ))}
          </div>
          {data.referrals.length > 0 && (
            <details>
              <summary className="text-xs cursor-pointer text-secondary">
                Distribution channels · reported referrals
              </summary>
              <ul className="mt-3 text-xs space-y-2">
                {data.referrals.map((r) => (
                  <li
                    key={r.referral || "unknown"}
                    className="flex gap-3 justify-between"
                  >
                    <span className="break-all">
                      {r.referral || "Not reported"}
                    </span>
                    <span className="text-muted whitespace-nowrap">
                      {r.successful} successful · {r.refunded} refunded ·{" "}
                      {r.failed} failed / {r.observed}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <div className="card space-y-4">
          <h2 className="text-sm text-secondary font-mono">
            Zcash confirmation leg
          </h2>
          <p className="text-xs text-muted">{data.latencyDefinition}</p>
          <div className="overflow-x-auto max-h-[280px]">
            <table className="w-full text-xs">
              <thead className="text-muted text-left">
                <tr>
                  <th className="py-2 font-normal">Route</th>
                  <th className="font-normal">Median</th>
                  <th className="font-normal">P90</th>
                  <th className="font-normal">Samples</th>
                </tr>
              </thead>
              <tbody>
                {data.latency.map((r) => (
                  <tr
                    key={r.chain + r.direction}
                    className="border-t border-cipher-border"
                  >
                    <td className="py-2 pr-3">
                      {r.direction === "inflow"
                        ? `${CHAINS[r.chain] || r.chain} → ZEC`
                        : `ZEC → ${CHAINS[r.chain] || r.chain}`}
                    </td>
                    <td>{r.median_minutes.toFixed(1)}m</td>
                    <td>{r.p90_minutes.toFixed(1)}m</td>
                    <td>{r.samples.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.latency.length && (
            <p className="text-xs text-muted">No qualifying matched samples.</p>
          )}
        </div>
      </section>
      <SwapExplorer
        key={JSON.stringify(params)}
        params={{ ...params, period }}
        unit={unit}
        statuses={c.statusesAvailable}
      />
      <section id="ecosystem" className="space-y-3">
        {wrapped.data && (
          <WrappedZecTracker
            assets={wrapped.data.assets}
            totalWrapped={wrapped.data.totalWrapped}
            unit="zec"
          />
        )}
        {wrapped.error && (
          <p className="text-xs text-muted">
            Wrapped-token supply is temporarily unavailable.
          </p>
        )}
        <p className="text-xs text-muted">
          Token supplies are separate contract observations, not swap volumes or
          a proof of reserves. Their sum is not a measure of unique backing.
        </p>
      </section>
      <section className="text-xs text-muted space-y-2">
        <h2 className="text-sm text-secondary">Data coverage & methodology</h2>
        <p>{c.note}</p>
        <p>{data.volumeDefinition}</p>
        <p>
          {c.internalSwaps.toLocaleString()} indexed Zcash → Zcash routes are
          available in the swap explorer but excluded from the external-route
          analytics.
        </p>
        <a
          href="https://docs.near-intents.org/api-reference/get-transactions"
          className="text-cipher-gold hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          NEAR Explorer API definitions ↗
        </a>
      </section>
    </div>
  );
}
