"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FilterGroup, FilterButton } from "@/components/ui/FilterGroup";
import { getMiningSoftwareEmoji } from "@/lib/coinbase-client";
import { SOFTWARE_LABELS, type MiningSoftware } from "@/lib/mining-software";
import pools from "@/lib/generated/mining-pools.json";
export const BLOCK_FILTER_KEYS = [
  "software", "pool", "order", "from", "to", "min_height", "max_height",
] as const;
export type BlockFilterValues = Partial<
  Record<(typeof BLOCK_FILTER_KEYS)[number], string>
>;
const field =
  "min-w-0 rounded-md border border-cipher-border bg-cipher-surface px-3 py-2 text-xs text-primary";
const softwareOptions = ["all", "zebra", "zakura", "unknown"] as const;

export function BlockFilters({ values }: { values: BlockFilterValues }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const software = values.software || "all";
  const hasRange = Boolean(values.from || values.to || values.min_height || values.max_height);
  const hasFilters = BLOCK_FILTER_KEYS.some((key) => {
    const value = values[key];
    return value && value !== "all" && !(key === "order" && value === "newest");
  });
  function navigate(next: BlockFilterValues) {
    const params = new URLSearchParams();
    for (const key of BLOCK_FILTER_KEYS) {
      const value = next[key];
      if (value && value !== "all" && !(key === "order" && value === "newest")) {
        params.set(key, value);
      }
    }
    startTransition(() => router.push(params.size ? `/blocks?${params}` : "/blocks", { scroll: false }));
  }
  return (
    <form
      action="/blocks"
      className="mb-4"
      aria-label="Block filters"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        navigate(Object.fromEntries(new FormData(event.currentTarget)) as BlockFilterValues);
      }}
    >
      <fieldset disabled={pending} className="min-w-0 disabled:opacity-60">
        <legend className="sr-only">Filter blocks</legend>
        <input type="hidden" name="software" value={software} />
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Software marker" className="max-w-full overflow-x-auto">
            <FilterGroup inline>
              {softwareOptions.map((key) => (
                <FilterButton key={key} active={software === key} onClick={() => navigate({ ...values, software: key })}>
                  {key === "all" ? "All markers" : <>{getMiningSoftwareEmoji(key)} {SOFTWARE_LABELS[key]}</>}
                </FilterButton>
              ))}
              {(["other", "conflicting", "missing"] as MiningSoftware[])
                .filter((key) => key === software)
                .map((key) => <FilterButton key={key} active>{SOFTWARE_LABELS[key]}</FilterButton>)}
            </FilterGroup>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted">
            Pool
            <select name="pool" defaultValue={values.pool || "all"} className={`${field} max-w-52`} onChange={(event) => navigate({ ...values, pool: event.target.value })}>
              <option value="all">All pools</option>
              {pools.map((name) => <option key={name}>{name}</option>)}
              <option value="unattributed">Unattributed</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-muted">
            Order
            <select name="order" defaultValue={values.order || "newest"} className={field} onChange={(event) => navigate({ ...values, order: event.target.value })}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
          {hasFilters && <Link href="/blocks" scroll={false} className="py-2 text-xs text-muted underline underline-offset-4 hover:text-primary">Reset</Link>}
          {pending && <span role="status" className="text-xs text-muted">Updating blocks…</span>}
        </div>
        <details className="mt-3 text-xs text-muted" open={hasRange}>
          <summary className="w-fit cursor-pointer py-1 hover:text-primary">Date & height range</summary>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5">
              From (UTC)
              <input type="date" name="from" defaultValue={values.from} className={field} />
            </label>
            <label className="flex flex-col gap-1.5">
              Through (UTC)
              <input type="date" name="to" defaultValue={values.to} className={field} />
            </label>
            <label className="flex flex-col gap-1.5">
              Minimum height
              <input type="number" name="min_height" min="0" step="1" defaultValue={values.min_height} className={`${field} w-36`} />
            </label>
            <label className="flex flex-col gap-1.5">
              Maximum height
              <input type="number" name="max_height" min="0" step="1" defaultValue={values.max_height} className={`${field} w-36`} />
            </label>
            <button type="submit" className="rounded-md border border-cipher-border px-3 py-2 text-xs text-primary hover:bg-cipher-surface">Apply range</button>
          </div>
        </details>
      </fieldset>
      <p className="mt-3 text-xs text-muted">
        Software tags are optional; untagged blocks cannot be assigned to a client.{" "}
        <Link href="/mining#software" className="underline underline-offset-4 hover:text-primary">Compare software shares →</Link>
      </p>
    </form>
  );
}
