"use client";
import { useState } from "react";
import Link from "next/link";
import { TokenChainIcon } from "@/components/TokenChainIcon";
import { Analytics, CHAINS, Unit, href, value } from "./model";
export function ChainFlowOverview({
  flows,
  unit,
  period,
}: {
  flows: Analytics["flows"];
  unit: Unit;
  period: string;
}) {
  const [direction, setDirection] = useState<"all" | "inflow" | "outflow">(
    "outflow",
  );
  const [metric, setMetric] = useState<"count" | "volume">("count");
  const score = (flow: Analytics["flows"][number]) => {
    if (metric === "count")
      return direction === "all"
        ? flow.swaps
        : direction === "inflow"
          ? flow.buy_swaps
          : flow.sell_swaps;
    const incoming = flow[`inflow_${unit}`],
      outgoing = flow[`outflow_${unit}`];
    if (direction === "inflow")
      return incoming == null ? -Infinity : Number(incoming);
    if (direction === "outflow")
      return outgoing == null ? -Infinity : Number(outgoing);
    return incoming == null && outgoing == null
      ? -Infinity
      : Number(incoming || 0) + Number(outgoing || 0);
  };
  const rows = [...flows].sort(
    (a, b) => score(b) - score(a) || a.chain.localeCompare(b.chain),
  );
  return (
    <section id="flows" className="card space-y-4">
      <h2 className="text-sm text-secondary font-mono">
        Where ZEC is bought & sold
      </h2>
      <p className="text-xs text-muted">
        Buy swaps acquire ZEC from the listed source chain; sell swaps exchange
        ZEC into the listed destination chain. Rank every indexed chain by swap
        count or volume in the selected period. Successful external routes only.
      </p>
      <div className="flex flex-wrap justify-between gap-3">
        <div
          role="group"
          aria-label="Rank chains by direction"
          className="filter-group"
        >
          {(
            [
              ["outflow", "ZEC sells"],
              ["inflow", "ZEC buys"],
              ["all", "All swaps"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setDirection(key)}
              aria-pressed={direction === key}
              className={`filter-btn ${direction === key ? "filter-btn-active" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          role="group"
          aria-label="Chain ranking metric"
          className="filter-group"
        >
          {(["count", "volume"] as const).map((key) => (
            <button
              key={key}
              onClick={() => setMetric(key)}
              aria-pressed={metric === key}
              className={`filter-btn ${metric === key ? "filter-btn-active" : ""}`}
            >
              {key === "count" ? "Swap count" : "Volume"}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted">
        Ranked by{" "}
        {direction === "outflow"
          ? "ZEC sells"
          : direction === "inflow"
            ? "ZEC buys"
            : "all swaps"}{" "}
        · {metric === "count" ? "swap count" : `${unit.toUpperCase()} volume`}.
        Select a count to inspect those swaps.
      </p>
      <div className="overflow-x-auto">
        <table
          className="w-full text-xs text-left"
          aria-label="Chain buy and sell ranking"
        >
          <thead className="text-muted">
            <tr>
              {[
                "Rank",
                "Chain",
                "Buy swaps",
                "Sell swaps",
                `Acquired · ${unit.toUpperCase()}`,
                `Exchanged · ${unit.toUpperCase()}`,
                `Net · ${unit.toUpperCase()}`,
              ].map((h) => (
                <th key={h} className="py-3 px-2 font-normal whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((f, i) => {
              const incoming = f[`inflow_${unit}`],
                outgoing = f[`outflow_${unit}`];
              const net =
                incoming == null || outgoing == null
                  ? null
                  : Number(incoming) - Number(outgoing);
              return (
                <tr key={f.chain} className="border-t border-cipher-border">
                  <td className="px-2 font-mono text-muted">{i + 1}</td>
                  <td className="px-2 py-3">
                    <Link
                      className="text-cipher-gold inline-flex items-center gap-2"
                      href={
                        href({ period, chain: f.chain, status: "SUCCESS" }) +
                        "#swaps"
                      }
                    >
                      <TokenChainIcon
                        token={f.chain}
                        chain={f.chain}
                        size={22}
                      />
                      {CHAINS[f.chain] || f.chain} →
                    </Link>
                  </td>
                  <td className="px-2 font-mono">
                    <Link
                      className="text-cipher-green hover:underline"
                      aria-label={`View ${f.buy_swaps} ZEC buys from ${CHAINS[f.chain] || f.chain}`}
                      href={
                        href({
                          period,
                          chain: f.chain,
                          status: "SUCCESS",
                          direction: "inflow",
                        }) + "#swaps"
                      }
                    >
                      {f.buy_swaps.toLocaleString()}
                    </Link>
                  </td>
                  <td className="px-2 font-mono">
                    <Link
                      className="text-cipher-orange hover:underline"
                      aria-label={`View ${f.sell_swaps} ZEC sells to ${CHAINS[f.chain] || f.chain}`}
                      href={
                        href({
                          period,
                          chain: f.chain,
                          status: "SUCCESS",
                          direction: "outflow",
                        }) + "#swaps"
                      }
                    >
                      {f.sell_swaps.toLocaleString()}
                    </Link>
                  </td>
                  <td className="px-2 font-mono whitespace-nowrap text-cipher-green">
                    {value(incoming, unit)}
                  </td>
                  <td className="px-2 font-mono whitespace-nowrap text-cipher-orange">
                    {value(outgoing, unit)}
                  </td>
                  <td className="px-2 font-mono whitespace-nowrap">
                    {net != null && net > 0 ? "+" : ""}
                    {value(net, unit)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Positive net means more ZEC acquired than exchanged. Missing values are
        excluded as disclosed above.
      </p>
      {!flows.length && (
        <p className="text-xs text-muted">
          No indexed successful external flows in this period.
        </p>
      )}
    </section>
  );
}
