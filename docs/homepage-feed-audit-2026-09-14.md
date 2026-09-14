# Homepage feed audit — 14 September 2026

## Incident and root cause

The “Time unavailable” regression was introduced by frontend commit `cf7a253`. The API had valid confirmation times. `/api/transactions/list` returns PostgreSQL BIGINT values as decimal strings, but `RecentTransactions` declared `block_time: number` and put unvalidated JSON directly into state. The old formatter's multiplication implicitly converted strings. The new `RelativeTime` component uses `Number.isFinite`, which rejects strings. Every valid string timestamp therefore became “Time unavailable.”

This is a data-boundary bug, separate from server rendering. The previous browser fixture used numeric timestamps and concealed the false TypeScript contract. The live-API browser check reproduced production's missing `<time datetime>` before the correction.

## Observed contracts

Public mainnet and testnet responses were inspected on 14 September 2026. The frontend currently consumes different contracts:

| Endpoint | Height/time representation | Money representation | Existing handling |
| --- | --- | --- | --- |
| `/api/blocks` | Decimal strings | Not relevant to age | Homepage/RecentBlocks explicitly parse numbers |
| `/api/transactions/list` | `block_height`, `block_time`: decimal strings | Balance/output fields: zatoshi strings | Raw PG rows; consumers incorrectly asserted numeric types |
| `/api/tx/shielded` | `blockHeight`, `blockTime`: numbers | Balance fields: ZEC numbers | Server route explicitly converts fields and units |

Authority: `server/api/routes/transactions/tx-lists.js` returns `result.rows`; `tx-read.js` maps shielded response fields. Confirmation time is the transaction's indexed block time, in Unix seconds. It is not first-seen time. A genuinely absent/invalid time must stay unknown, never become the current time.

## Correction

`lib/transaction-list.ts` supplies one explicit decoder and view model for the legacy transaction-list endpoint. Homepage fetches, `/txs` browser fetches, and `/txs` server rendering now use it. Valid integer timestamp strings become numeric seconds; invalid/missing timestamps become null. Heights/counts/flags are validated. Monetary strings remain exact zatoshis; this boundary neither divides them into ZEC nor globally converts numeric-looking strings. The public backend response contract is unchanged.

`RelativeTime` continues to accept numeric seconds or null. Weakening its guard to accept arbitrary API objects would hide the boundary defect. Duplicate frontend declarations and the unvalidated transaction-array casts have been removed.

Captured production fixtures retain the real JSON types. Regression tests cover numeric/string timestamps, invalid/missing timestamps, malformed records, and preservation of large monetary strings. The live browser smoke compares each displayed datetime to the actual response used by that page.

## Other findings: pre-existing risks, not explanations for this incident

- **Refresh behavior differs by feed.** RecentBlocks uses `fetchLiveJson` with a 15-second deadline and `startLiveRefresh` with serialized polling, hidden-tab pause, and foreground/online catch-up. Both transaction widgets use plain fetch and independent intervals (60 seconds with WebSocket connected, 10 seconds otherwise), without equivalent deadlines or overlap control. A slow request can overlap a newer one.
- **First-ID deduplication is too coarse.** Both transaction widgets skip snapshots whose first txid is unchanged, and ignore successful empty snapshots. Corrections to other rows or metadata can therefore be missed. The generic paginated-list hook has a similar early return. This is code-supported risk, not a demonstrated cause of the timestamp incident.
- **Shielded WebSocket refresh uses increasing height.** Its gate can skip a same-height chain replacement. Polling still exists, but the first-ID check can also suppress the corrected snapshot.
- **Initial failure and an empty result are not clearly distinguished.** Retaining good rows on transient failure is useful; showing an empty-looking table after an initial failure is ambiguous.
- **Storage resilience is scoped.** Tests exercise the card preference key only. A previous broad `Storage.prototype.getItem` experiment affected both localStorage and sessionStorage; `NU7VoteBanner` reads sessionStorage without a guard. It does not establish that all browser storage denial is handled.
- **No-JavaScript coverage was narrower than whole-page usability.** The feed has a noscript fallback, but the existing outer Next.js loading/streaming boundary requires its reveal script. The browser test isolates feed markup and explicitly does not claim app-wide no-JS support.

## Why the original flash happened

The initial server snapshot and browser view used different clock/display state and different preference state. Servers cannot read a user's localStorage selection. SSR itself does not require a visible flash: render the same initial state on both sides, and reserve stable space for client-only preferences. The shared server clock fixes deterministic initial relative ages. The current card placeholder delays the preference-dependent view until preferences load; it also means failed hydration can leave that placeholder visible. That tradeoff should be explicit.

For an ISR-cached homepage, retaining the shared timestamp and a bounded preference placeholder is coherent. If eliminating that placeholder becomes a product requirement, choose a deliberate preference policy (for example request-readable cookies with appropriate cache partitioning). Adding more effects, timestamp fallbacks, or concealment would not resolve the underlying policy.

## Recommended bounded follow-up

Reuse the existing live-refresh primitives for both transaction widgets, with one decoded complete snapshot, one in-flight request, explicit initial failure versus empty semantics, and focus/reconnect catch-up. Replace first-ID-only deduplication with complete snapshot handling. Verify same-height replacement, corrected rows, empty results, slow/out-of-order responses, and failed requests with a retained last-good snapshot. Keep endpoint units explicit rather than imposing a global JSON number converter.

This correction deliberately does not combine those lifecycle changes with the incident repair. No rebrand, database migration, API deployment, or SEO policy change is required.

## Verification

Typecheck, lint (existing warnings), production build, 12 live-refresh/timestamp tests, 19 sitemap-security tests, 9 performance regressions, and 4 build route-cache tests passed. Browser verification uses captured production types for delayed hydration/preferences and a separate actual-API smoke for transaction ages. The local smoke substitutes an allowed Origin/CORS header because the production API rejects localhost origins with HTTP 500; it does not modify the response data. Production verification uses the site's actual origin.
