"use client";
import Link from "next/link";
import { TokenChainIcon } from "@/components/TokenChainIcon";
import { useApiQuery } from "@/hooks/useApiQuery";
import {
  CHAINS,
  IS_DEMO,
  EXPLORERS,
  STATUSES,
  Swap,
  SwapPage,
  Unit,
  date,
  href,
  value,
} from "./model";
function Hashes({ chain, hashes }: { chain: string; hashes: string[] }) {
  if (!hashes.length) return <span className="text-muted">Not reported</span>;
  return (
    <ul className="space-y-1">
      {hashes.map((hash) => (
        <li key={hash} className="break-all font-mono">
          {EXPLORERS[chain] && !IS_DEMO ? (
            <a
              className="text-cipher-gold hover:underline"
              href={EXPLORERS[chain] + encodeURIComponent(hash)}
              target={chain === "zec" ? undefined : "_blank"}
              rel="noopener noreferrer"
            >
              {hash}
            </a>
          ) : (
            hash
          )}
        </li>
      ))}
    </ul>
  );
}
function Detail({ swap: s }: { swap: Swap }) {
  const fields = [
    ["Deposit address", s.depositAddress],
    [
      "Deposit memo",
      s.depositMemo === null
        ? "Unavailable in legacy index"
        : s.depositMemo || "None",
    ],
    ["Source amount (token units)", s.sourceAmount],
    ["Destination amount (token units)", s.destAmount],
    ["Reported source USD", s.amountUsd],
    ["Source asset", s.sourceAsset],
    ["Destination asset", s.destAsset],
    ["Raw input (smallest unit)", s.amountInRaw],
    ["Raw output (smallest unit)", s.amountOutRaw],
    ["Deposit type", s.depositType],
    ["Recipient type", s.recipientType],
    ["Referral", s.referral],
    ["Intent hashes", s.intentHashes],
    ["Reported sender addresses", s.senders?.join(", ") || null],
    ["Recipient", s.recipient],
    ["Refund destination", s.refundTo],
    ["Refund type", s.refundType],
    ["Refund reason", s.refundReason],
    ["Refund fee (source token)", s.refundFee],
    ["First indexed", date(s.firstSeenAt)],
    ["Last observed", date(s.lastSeenAt)],
    ["Status first observed", date(s.statusObservedAt)],
  ];
  return (
    <div className="mt-4 pt-4 border-t border-cipher-border space-y-4 text-xs">
      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <p className="text-muted mb-2">
            Source transaction · {CHAINS[s.sourceChain] || s.sourceChain}
          </p>
          <Hashes chain={s.sourceChain} hashes={s.sourceTxHashes} />
        </div>
        <div>
          <p className="text-muted mb-2">
            Destination transaction · {CHAINS[s.destChain] || s.destChain}
          </p>
          <Hashes chain={s.destChain} hashes={s.destTxHashes} />
        </div>
        <div>
          <p className="text-muted mb-2">NEAR transactions</p>
          <Hashes chain="near" hashes={s.nearTxHashes} />
        </div>
      </div>
      <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
        {fields.map(([label, v]) => (
          <div key={label}>
            <dt className="text-muted">{label}</dt>
            <dd className="break-all font-mono mt-1">{v ?? "Not reported"}</dd>
          </div>
        ))}
      </dl>
      {s.appFees && s.appFees.length > 0 && (
        <div>
          <p className="text-muted">
            Reported application fees (basis points; not total swap cost)
          </p>
          {s.appFees.map((fee, i) => (
            <p key={i} className="break-all">
              {fee.fee} bps · {fee.recipient}
            </p>
          ))}
        </div>
      )}
      <p className="text-muted">
        Observation timestamps are indexer observations, not execution
        completion times. Pending amounts may be withheld by NEAR.
      </p>
    </div>
  );
}
export function SwapExplorer({
  params,
  unit,
  statuses,
}: {
  params: Record<string, string>;
  unit: Unit;
  statuses: string[];
}) {
  const { data, loading, error, isRefreshing } = useApiQuery<SwapPage>(
    "/v1/crosschain/swaps",
    { ...params, limit: "25" },
    { refreshInterval: params.cursor ? undefined : 120000 },
  );
  const field =
    "bg-cipher-bg border border-cipher-border rounded-lg px-3 py-2 text-sm w-full";
  return (
    <section id="swaps" className="card space-y-4">
      <div>
        <h2 className="text-sm font-mono text-secondary">Swap explorer</h2>
        <p className="text-xs text-muted mt-2">
          Each row is one swap. Filter the records, then expand a row for its
          amounts, status and transaction links. Route links above apply filters
          here. Search uses an exact address or transaction hash.
        </p>
      </div>
      {IS_DEMO && (
        <p className="text-xs text-cipher-orange">
          Simulated preview records: “fixture-” IDs are examples, not real
          addresses or transaction hashes.
        </p>
      )}
      <form
        action="/crosschain"
        method="get"
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        <input type="hidden" name="period" value={params.period || "30d"} />
        {["sourceAsset", "destAsset"].map((k) =>
          params[k] ? (
            <input key={k} type="hidden" name={k} value={params[k]} />
          ) : null,
        )}
        <label className="text-xs text-muted">
          Referral
          <input
            name="referral"
            defaultValue={params.referral}
            maxLength={256}
            className={field}
          />
        </label>
        <label className="text-xs text-muted">
          Direction
          <select
            name="direction"
            defaultValue={params.direction || ""}
            className={field}
          >
            <option value="">All directions</option>
            <option value="inflow">ZEC acquired</option>
            <option value="outflow">ZEC exchanged</option>
            <option value="internal">Zcash → Zcash</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          Status
          <select
            name="status"
            defaultValue={params.status || ""}
            className={field}
          >
            <option value="">All indexed statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s} disabled={!statuses.includes(s)}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Chain
          <input
            name="chain"
            list="crosschain-chain-options"
            defaultValue={params.chain || ""}
            placeholder="All chains, or chain ID"
            maxLength={32}
            className={field}
          />
          <datalist id="crosschain-chain-options">
            {Object.entries(CHAINS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </datalist>
        </label>
        <label className="text-xs text-muted">
          Token
          <input
            name="token"
            defaultValue={params.token}
            placeholder="e.g. USDC"
            maxLength={64}
            className={field}
          />
        </label>
        <label className="text-xs text-muted">
          Minimum USD
          <input
            name="minUsd"
            defaultValue={params.minUsd}
            type="number"
            min="0"
            step="any"
            className={field}
          />
        </label>
        <label className="text-xs text-muted">
          Maximum USD
          <input
            name="maxUsd"
            defaultValue={params.maxUsd}
            type="number"
            min="0"
            step="any"
            className={field}
          />
        </label>
        <label className="text-xs text-muted">
          From (UTC ISO)
          <input
            name="from"
            defaultValue={params.from}
            placeholder="2026-01-01T00:00:00Z"
            className={field}
          />
        </label>
        <label className="text-xs text-muted">
          Until (UTC ISO, exclusive)
          <input
            name="to"
            defaultValue={params.to}
            placeholder="2026-09-28T00:00:00Z"
            className={field}
          />
        </label>
        <label className="col-span-2 md:col-span-3 text-xs text-muted">
          Address or transaction hash
          <input
            name="search"
            defaultValue={params.search}
            maxLength={200}
            className={field}
          />
        </label>
        <div className="flex items-end gap-3">
          <button className="filter-btn filter-btn-active py-2" type="submit">
            Apply filters
          </button>
          <Link
            className="text-xs text-muted hover:underline"
            href={href({ period: params.period || "30d" })}
          >
            Reset
          </Link>
        </div>
      </form>
      {error && (
        <p role="alert" className="text-sm text-cipher-orange">
          Swap feed unavailable: {error}
        </p>
      )}
      {loading && !data ? (
        <p role="status">Loading swaps…</p>
      ) : (
        data && (
          <div aria-busy={isRefreshing}>
            {data.swaps.length === 0 ? (
              <p className="text-muted py-8 text-center">
                No indexed swaps match these filters.
              </p>
            ) : (
              data.swaps.map((s) => (
                <details
                  key={s.id}
                  className="border-t border-cipher-border py-3 group"
                >
                  <summary className="cursor-pointer grid grid-cols-2 md:grid-cols-5 gap-3 text-xs items-center">
                    <span className="font-mono text-muted">
                      {date(s.createdAt)}
                    </span>
                    <span>
                      <span className="text-secondary flex items-center gap-2">
                        <TokenChainIcon
                          token={s.sourceToken}
                          chain={s.sourceChain}
                          size={22}
                        />
                        {s.sourceToken} ·{" "}
                        {CHAINS[s.sourceChain] || s.sourceChain}
                      </span>
                      <span className="block text-muted mt-1">
                        {s.sourceAmount ?? "Amount withheld"}
                      </span>
                    </span>
                    <span>
                      <span className="text-secondary flex items-center gap-2">
                        →{" "}
                        <TokenChainIcon
                          token={s.destToken}
                          chain={s.destChain}
                          size={22}
                        />{" "}
                        {s.destToken} · {CHAINS[s.destChain] || s.destChain}
                      </span>
                      <span className="block text-muted mt-1">
                        {s.destAmount ?? "Amount withheld"}
                      </span>
                    </span>
                    <span className="font-mono">
                      {value(unit === "zec" ? s.zecAmount : s.amountUsd, unit)}
                    </span>
                    <span className="text-muted">
                      {s.status.replaceAll("_", " ")}{" "}
                      <span aria-hidden="true">⌄</span>
                      <span className="sr-only"> — expand details</span>
                    </span>
                  </summary>
                  <Detail swap={s} />
                </details>
              ))
            )}
            <div className="flex justify-between gap-4 border-t border-cipher-border pt-4 text-xs">
              <span className="text-muted">
                {data.swaps.length} records on this page
              </span>
              <div className="flex gap-4">
                {params.cursor && (
                  <Link
                    className="text-cipher-gold"
                    href={href(params, { cursor: undefined })}
                  >
                    Newest matches
                  </Link>
                )}
                {data.nextCursor && (
                  <Link
                    className="text-cipher-gold"
                    href={href(params, { cursor: data.nextCursor })}
                  >
                    Older matches →
                  </Link>
                )}
              </div>
            </div>
          </div>
        )
      )}
    </section>
  );
}
