# Search-interest seed export

`google-trends-zcash-2026-09-07.csv` is the user-provided Google Trends Zcash-only export: 54 weekly observations, worldwide, all categories. Its local file modification time was `2026-09-06T21:27:19.567Z`; this is used as the export capture-time approximation. **Web Search is assumed from the valuation page's selected source; the CSV does not encode search property.** Confirm this when replacing the seed.

The separate Zcash/Bitcoin comparison export is deliberately not imported: its shared scale is different and Zcash readings below 1 cannot be treated as zero.

The seed is not bundled into the browser. After applying migration 022 from `cipherscan-rust/schema/migrations`, import on the API server:

```sh
NODE_PATH=server/api/node_modules node server/jobs/import-google-trends.js server/data/google-trends-zcash-2026-09-07.csv 2026-09-06T21:27:19.567Z --dry-run
NODE_PATH=server/api/node_modules node server/jobs/import-google-trends.js server/data/google-trends-zcash-2026-09-07.csv 2026-09-06T21:27:19.567Z
```

The job loads standard job/API database environment variables. Run it only against the intended database. Importing is an atomic, parameterized write; validation happens before connecting. Duplicate series do not refresh capture time. New windows are separate snapshots, not appended to differently normalized history.

`GET /api/valuation/search-interest` returns `{success:true,snapshot:null}` for no stored data, a dated snapshot otherwise, or HTTP 503 on backend failure. The response declares `automaticRefresh:false` and `scored:false`. Redis caches it for five minutes. A missing migration produces an unavailable chart rather than a fake series. `<1` is stored as null plus `below_one=true`; zero stays zero. A week less than seven days old at capture remains provisional in that immutable snapshot.

## Daily collection

No scheduled fetch is enabled. Google API/provider access is not configured. Once available, add a server-side collector that fetches a consistent query/window, validates the response and stores an atomic snapshot through the same data contract. Keep credentials server-side, record provider capture/fetch attempts, back off on 429/5xx and retain the last good snapshot on failure. Do not claim a daily refresh from a manually imported CSV, concatenate independently scaled windows, or use partial/censored observations as zero in an indicator.

Before weighting search interest, archive enough timestamped snapshots for walk-forward validation. A present-day normalized export cannot reproduce what an indicator knew at an earlier date. MVRV and NUPL share inputs and must not count as two independent confirmations. Attention can reflect concern as well as demand. Current UI provides context and publishes no buy/sell or fair-value verdict.

Deployment state: implemented locally; production migration, import and API rollout are not performed by these instructions.
