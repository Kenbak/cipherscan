# Zero Indexer attestation monitor

Scope: a public observer only. This does not deploy a shim/hub, change wallet
routing, or submit transactions. The four mainnet and one testnet endpoints in
`server/data/attestation-endpoints.json` are a curated experimental registry.
Names, networks and hub relationships come from published configurations and the
linked announcement; they are not derived from cryptographic evidence. Baselines
are intentionally null: the initial release cannot assert expected software.

## Local preview with real data

Requires Node 22.14+ and OpenSSL 3 (`openssl` on PATH). No API key or account.
For the preview, install the frontend and API packages with `npm ci` and
`npm ci --prefix server/api`. The collector itself has no npm dependencies.

```sh
export ATTESTATION_SNAPSHOT_PATH=/tmp/cipherscan-attestations-snapshot.json
npm run attestations:collect
node server/scripts/preview-attestations.js
```

In a second terminal, from the same checkout:

```sh
NEXT_PUBLIC_NETWORK=mainnet NEXT_PUBLIC_API_URL=http://127.0.0.1:3102 npm run dev -- --port 3101
```

Open `http://localhost:3101/network/attestations`. Preview API is loopback-only and runs the real
read-only router without chain/database dependencies. Other public GET reads are proxied to the
selected public API to populate the existing explorer shell, without credentials. It refreshes the snapshot
every five minutes. Use `ZCASH_NETWORK=testnet` for the preview API and
`NEXT_PUBLIC_NETWORK=testnet` for the page to see the testnet endpoint.

## Production installation

Ship the API route with the application, then install the observer. Frontend may
ship before the observer and will show “not checked”/unavailable rather than a
fabricated success. The worker has no npm dependencies: verifier primitives are
vendored at an exact MIT-licensed upstream commit with file hashes in PROVENANCE.
OpenSSL additionally validates the X.509 path against only the pinned Nitro root.

Install the following tree at `/opt/cipherscan-attestations`, root-owned,
directories 0755 and files 0644, from the reviewed main commit:

- `lib/attestation-status.js`
- `server/data/attestation-endpoints.json`
- `server/lib/attestation-store.js`
- `server/lib/attestation-verifier.mjs`
- `server/jobs/check-attestations.mjs`
- `server/vendor/tee-attestation-js/` (including license and provenance)

Require `/usr/bin/node` version 22.14+ and `/usr/bin/openssl` version 3. Copy the
service and timer files beside this document into `/etc/systemd/system`, then:

```sh
sudo systemctl daemon-reload
sudo systemctl start cipherscan-attestations.service
sudo systemctl enable --now cipherscan-attestations.timer
sudo systemctl status cipherscan-attestations.timer
sudo journalctl -u cipherscan-attestations.service -n 10
```

The DynamicUser service writes an atomic snapshot to
`/var/lib/cipherscan/attestations/snapshot.json` using systemd StateDirectory.
The existing root API can read it; a future non-root API needs an explicit
read-only group/ACL arrangement. Do not grant the API write access. No schema,
Redis, Rust indexer or chain RPC change is required. The source deployment unit
must be reconciled with live service settings before installation.

Verify `GET /api/network/attestations` on the API host, and the public page's raw
HTML, metadata and displayed timestamps. Mainnet returns four endpoints; testnet
returns one. Unknown endpoint IDs return 404, as do mainnet IDs on testnet.
Crosslink returns an empty API registry and the public page returns 404/noindex.
The mainnet core sitemap includes the page; testnet sitemaps remain homepage-only.

For rollback, stop/disable the timer and service. Retained observations become
stale after 15 minutes; do not replace them with synthetic healthy values. API
and page changes can be reverted independently. Deleting the snapshot produces
an explicit unavailable response with the configured registry still present.

## Data and verification contract

- Worker requests only allowlisted HTTPS hosts on port 443, `/attestation`.
  Public IPv4-only DNS resolution is bound to the connection; redirects and
  private addresses are rejected. The deadline is 15 seconds including DNS,
  handshake and body, with a 64 KiB response limit and concurrency two.
- A fresh 32-byte nonce, pinned-root certificate path, COSE signature, SHA384,
  nonzero 96-hex PCR0/1/2, and timestamp (at most 5 minutes old / 30 seconds ahead)
  are required. TLS binding compares signed mode/domain/certificate fingerprint
  with the same verified HTTPS connection. It is not a wallet-session guarantee.
- `latest` records every attempt. `lastSuccessful` retains the last evidence/TLS
  success without a release mismatch. All times are ISO 8601 UTC; PCRs are
  SHA-384 hex; certificate/document hashes are SHA-256 hex. No money units or
  transaction telemetry are collected. Durations ending in `Ms` are milliseconds.
- `release=unconfirmed` means no baseline exists. `published_match` distinguishes
  externally published values from `reproduced_match`; `mismatch` is not approved.
  Baselines must include all three nonzero PCRs, a commit, an HTTPS reference and
  `authority: published|reproduced`. Add only after review; never promote observed
  values or manifest claims automatically. Changing any registry entry invalidates
  its previous observations until the next check.
- Only a bounded commit matching the registered source URL is exposed from the
  unsigned manifest, labeled claimed/unverified. Manifest URLs/commands are never
  executed or published as arbitrary links. No raw document or untrusted metadata
  is logged; the document digest allows comparing observations without pretending
  that the public API is itself a cryptographic attestation.
- Public API: `success`, `network`, `generatedAt`, `servedAt`, `available`,
  `freshForMs`, `pollIntervalMs`, `endpoints`. The detail route replaces
  `endpoints` with `endpoint`. Missing/corrupt storage is HTTP 200 with
  `available:false`, null observations and the registry. A connection failure is
  separate from evidence failure. API is no-store and X-Robots-Tag noindex.
- Freshness is derived on API reads and every 15 seconds in the browser, including
  tab visibility changes. At 15 minutes an observation becomes stale, including
  failed observations. A later failure never inherits an earlier green result.
  No historical uptime/SLA claim is made from this single-snapshot store.

Checks: `npm run test:attestations`, relevant sitemap/HTML tests, typecheck/lint,
production build, and real endpoint smoke checks. Upstream verifier updates need
cryptographic negative tests and live checks; do not infer safety from a version
number or an unqualified CLI success line.
