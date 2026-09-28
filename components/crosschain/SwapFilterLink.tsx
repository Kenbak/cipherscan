"use client";
import { useSyncExternalStore, type ComponentProps } from "react";
import { useSearchParams } from "next/navigation";

const FILTER_EVENT = "crosschain:filters";
function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener("hashchange", listener);
  window.addEventListener(FILTER_EVENT, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener("hashchange", listener);
    window.removeEventListener(FILTER_EVENT, listener);
  };
}
const snapshot = () => window.location.search;
const periodSnapshot = () =>
  new URLSearchParams(window.location.search).get("period") || "30d";

export function useAnalyticsPeriod(initialPeriod: string) {
  return useSyncExternalStore(subscribe, periodSnapshot, () => initialPeriod);
}

export function useSwapSearchParams() {
  const initial = useSearchParams();
  // Plain section anchors can create history entries with no Next router state.
  // Read the actual URL on traversal too, so Back cannot leave stale filters.
  const search = useSyncExternalStore(subscribe, snapshot, () =>
    initial.toString(),
  );
  return new URLSearchParams(search);
}

/** Update only the feed's URL state; Next synchronizes useSearchParams and Back/Forward. */
export function updateSwapUrl(href: string, scrollToSwaps = false) {
  if (
    href !==
    window.location.pathname + window.location.search + window.location.hash
  ) {
    window.history.pushState(null, "", href);
    window.dispatchEvent(new Event(FILTER_EVENT));
  }
  if (scrollToSwaps)
    document.getElementById("swaps")?.scrollIntoView({ block: "start" });
}

export function SwapFilterLink({
  href,
  scrollToSwaps = false,
  onClick,
  ...props
}: Omit<ComponentProps<"a">, "href"> & {
  href: string;
  scrollToSwaps?: boolean;
}) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          (props.target && props.target !== "_self") ||
          props.download != null
        )
          return;
        event.preventDefault();
        updateSwapUrl(href, scrollToSwaps);
      }}
    />
  );
}
