"use client";
import Link from "next/link";
import { SOFTWARE_LABELS } from "@/lib/mining-software";
import pools from "@/lib/generated/mining-pools.json";
export const BLOCK_FILTER_KEYS = [
  "software",
  "pool",
  "order",
  "from",
  "to",
  "min_height",
  "max_height",
] as const;
export type BlockFilterValues = Partial<
  Record<(typeof BLOCK_FILTER_KEYS)[number], string>
>;
const field =
  "w-full min-w-0 rounded-md border border-cipher-border bg-cipher-surface px-3 py-2 text-sm text-primary";
export function BlockFilters({ values }: { values: BlockFilterValues }) {
  return (
    <form
      action="/blocks"
      className="mb-5 rounded-lg border border-cipher-border p-4"
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <label className="space-y-1.5 text-xs text-muted">
          Software marker
          <select
            name="software"
            defaultValue={values.software || "all"}
            className={field}
          >
            <option value="all">All markers</option>
            {Object.entries(SOFTWARE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 text-xs text-muted">
          Mining pool
          <select
            name="pool"
            defaultValue={values.pool || "all"}
            className={field}
          >
            <option value="all">All pools</option>
            {pools.map((name) => (
              <option key={name}>{name}</option>
            ))}
            <option value="unattributed">Unattributed</option>
          </select>
        </label>
        <label className="space-y-1.5 text-xs text-muted">
          Order
          <select
            name="order"
            defaultValue={values.order || "newest"}
            className={field}
          >
            <option value="newest">Newest blocks first</option>
            <option value="oldest">Oldest blocks first</option>
          </select>
        </label>
        <div className="flex items-end gap-3">
          <button
            type="submit"
            className="rounded-md bg-brand-gold px-4 py-2 text-sm font-medium text-black"
          >
            Apply filters
          </button>
          <Link
            href="/blocks"
            className="py-2 text-sm text-muted hover:text-primary"
          >
            Reset
          </Link>
        </div>
      </div>
      <details
        className="mt-3 text-xs text-muted"
        open={Boolean(
          values.from || values.to || values.min_height || values.max_height,
        )}
      >
        <summary className="cursor-pointer py-1">Date & height range</summary>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <label className="space-y-1.5">
            From (UTC)
            <input
              type="date"
              name="from"
              defaultValue={values.from}
              className={field}
            />
          </label>
          <label className="space-y-1.5">
            Through (UTC)
            <input
              type="date"
              name="to"
              defaultValue={values.to}
              className={field}
            />
          </label>
          <label className="space-y-1.5">
            Minimum height
            <input
              type="number"
              min="0"
              step="1"
              name="min_height"
              defaultValue={values.min_height}
              className={field}
            />
          </label>
          <label className="space-y-1.5">
            Maximum height
            <input
              type="number"
              min="0"
              step="1"
              name="max_height"
              defaultValue={values.max_height}
              className={field}
            />
          </label>
        </div>
      </details>
      <p className="mt-3 text-xs text-muted">
        Coinbase markers are self-reported. Unmarked blocks do not reveal their
        mining software.{" "}
        <Link
          href="/mining#software"
          className="underline underline-offset-4 hover:text-primary"
        >
          Compare software shares →
        </Link>
      </p>
    </form>
  );
}
