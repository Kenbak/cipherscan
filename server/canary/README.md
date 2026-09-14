# CipherScan Canary integration

Pinned upstream: Canary `0f12c09bae9b512ad010324e3d5c57042ef85619`, Bootproof
`b346db17523ad9b13ef41eb9c14df3328bbd80d1` (corrected ES384 encoding).
Upstream and our host launcher are AGPL-3.0-only. Build from the pinned source; copy `host.rs` to
`crates/canaryd/examples/cipherscan-host.rs` and build with:

```sh
cargo build --locked --release -p canaryctl -p canaryd --bin canaryctl --example cipherscan-host
```

The launcher uses upstream Runtime, scheduler, signer, SQLite and probe/verifier
without modifying them. It changes paths, loads a stable seed with systemd
credentials, handles SIGTERM and binds only `127.0.0.1:3187`. It runs on a normal
CipherScan server, **not in an enclave**. The public signs of trust are operator-pinned
keys and independently reproduced **target** PCRs; do not call this an attested Canary.

## Services and policy

- `cipherscan-canary.service`: 60-second probes, 1000 retained observations per target,
  384 MiB memory cap and 50% CPU quota. Persistent state in `/var/lib/cipherscan/canary`.
- `cipherscan-canary-report.timer`: every 60 seconds, verifies both signatures and
  linked target evidence through `canaryctl`, plus expected config/PCR/TLS/identity
  checks. Writes `/var/lib/cipherscan/canary-observations/snapshot.json` atomically.
- `cipherscan-attestations.timer`: existing five-minute observer remains independent.
- `cipherscan-canary-watch.service`: installed but not enabled until an operator
  supplies and authorizes an HTTPS receiver and a shared HMAC secret.

Generate network-specific policy using `node server/canary/config.js mainnet`
(or `testnet`). Only registry entries with independently reproduced baselines qualify.
Caution hub's unknown expected build is not replaced with measurements learned from
its live response. Changes require deploying the updated policy to Canary and the
API/reporter together. A policy mismatch withdraws verified status.

The first enrollment pins the newly generated public keyset in
`/etc/cipherscan-canary/keys.json`. Never re-enroll automatically after a mismatch.
Root seed `/etc/cipherscan-canary/seed` is root-only, loaded through `LoadCredential`,
not committed, printed, or exposed by the API. A normal restart retains keys.
Rotate by deliberately replacing the seed and reviewing/publishing new key pins;
consumers must approve new keys. Protect seed backups through the server's secret
backup policy; no extra backup system is introduced here.

The report expires after 120 seconds without a successful reporter run; signed
statements also retain their own maximum 180-second expiry. An unsigned transport
warning is shown separately and suppresses a green Canary label even while an older
signed success is fresh. Cryptographic/policy errors replace retained success with
unavailable verification. Existing evidence/release/hub labels are unchanged.

## Public verification artifacts

The existing network API origin exposes exact upstream JSON at `/keys.json`,
`/config.json`, `/status.json`, `/targets/ID/statement`, `/targets/ID/evidence` and
`/targets/ID/history`. These paths are required because upstream `canaryctl` accepts
an origin without a path prefix. They are a separate Canary protocol, not new v1
explorer endpoints. All responses use `no-store` and `noindex, follow`; only configured
network targets are exposed. No request triggers an endpoint probe or executes a CLI.

On mainnet use `https://api.mainnet.cipherscan.app` as the Canary origin (testnet:
`https://api.testnet.cipherscan.app`). For this explicitly conventional-host service:

```sh
canaryctl save-canary-keys --canary-url https://api.mainnet.cipherscan.app --skip-canary-attestation --output cipherscan-mainnet-keys.json
canaryctl verify --canary-url https://api.mainnet.cipherscan.app --skip-canary-attestation --trusted-keys cipherscan-mainnet-keys.json --target zecrocks-mainnet
```

Initial enrollment trusts the operator-delivered keys/config (upstream calls this
TOFU). Compare public keys and expected measurements through an independent trusted
channel; HTTPS and signed results do not authenticate the host's running software.
No `--allow-http` is needed by public clients. If moved to Nitro later, establish
Canary's independently reproduced PCRs/config/key binding and remove the skip flag.

## Webhook hookup

Anton requested machine-readable state changes that operators can connect to their
own notification/status systems. The upstream watcher verifies Canary before emitting
`target.status_changed`, `target.read_failed`, `target.read_recovered`,
`canary.unavailable`, `canary.verification_failed`, `canary.recovered` and
`watcher.heartbeat`. Transient read/outage alerts use a three-poll threshold; signed
state transitions follow the upstream watcher. This is not a repeated alert per probe.

Copy `watch.example.json` to `/etc/cipherscan-canary/watch.json`, substitute the
operator-approved HTTPS receiver and correct network target, and put a base64-encoded
32-byte secret into root-only `/etc/cipherscan-canary/webhooks.env` using the named
environment variable. Do not use the example receiver or invent a destination.
Enable the watcher only after this configuration is reviewed and delivery authorized.
The local skip/HTTP flags reflect our conventional host and loopback connection;
they do not weaken the target's Nitro/PCR/TLS verification or authenticate the host.

Receivers must validate `X-Canary-Signature: v1=<hex HMAC-SHA256(timestamp + "." + raw-body)>`,
`X-Canary-Timestamp` and `X-Canary-Event-Id`. Deduplicate event IDs; retries reuse the
original ID/timestamp/body/signature. Route meaningful events to the team's chosen
channels and treat heartbeats separately. Persistent webhook history/notification
routing is separate from Canary's bounded observation database.

## Rollback

Disable the Canary reporter timer and Canary service (and watcher, if enabled).
The existing collector continues. Canary labels expire or become unavailable;
no previous green observation is substituted. Restore the previous versioned
`/opt/cipherscan-canary` symlink only with its matching policy and reviewed key pin.
