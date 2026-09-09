# Canary compatibility assessment — 2026-09-10

Reviewed upstream commit [`c5a3761798f9c438944d235551ddd192df9c1915`](https://codeberg.org/caution/canary/src/commit/c5a3761798f9c438944d235551ddd192df9c1915).
This is a source/documentation assessment, not a security audit or an executed
Canary deployment. No Canary binary, signing identity, service or public endpoint
was installed. Existing monitoring remains authoritative for the dashboard.

## Decision

Canary is a useful candidate for independently verifiable signed observations,
but is not a drop-in replacement for the current collector. Keep the working
observer and independent rebuild evidence. Evaluate Canary separately with our
two reproduced Zec.rocks targets and explicit TLS mode before deciding adoption.
Do not add Caution hub using trust-on-first-use: its source-backed baseline is
still missing. Do not replace our separate evidence/TLS/release states with an
unqualified Canary VERIFIED label.

## Comparison

| Concern | Current monitor | Canary at the reviewed commit | Integration consequence |
| --- | --- | --- | --- |
| Evidence | Pinned Caution JS Nitro primitives, OpenSSL path verification, nonce/timestamp/PCR checks | Pinned Rust Bootproof SDK (`78f531a2c245404a9d8879fb71cc397096ae0077`) | Useful implementation diversity; compare negative vectors before adoption. |
| TLS binding | Required, domain plus certificate fingerprint from the same attestation connection | Opt-in `e2e_mode: tls`; exact-connection fingerprint checks | Explicit TLS mode for every evaluated target; never use the PCR-only profile as equivalent. |
| Expected software | Reproduced/published baseline status separate from evidence; missing baseline remains unconfirmed | Config requires expected PCR0/1/2; TOFU supplies continuity, not source reproduction | Only our independently reproduced Zec.rocks measurements are eligible initially. |
| Result lifetime | 900 seconds, probes every 300 seconds | Fixed 180-second result lifetime, default 60-second probes; configurable probe interval | Retaining our 300-second interval would create stale gaps. Preserve both observers' own expiry rules. |
| Transport failure | Latest failed/unreachable attempt immediately replaces green status | Fresh definitive result can remain VERIFIED with a transport warning; persistent outage derives UNREACHABLE after expiry | Show latest attempt and warning explicitly; no direct status substitution. |
| Public proof | HTTPS API snapshot and document digest; consumers trust our observer | Ed25519 plus ML-DSA-65 signed statements and linked evidence, verified with `canaryctl` | Verify both signatures, trust inputs, evidence linkage and expiry before consuming; a JSON status alone is insufficient. |
| Operations | Stateless oneshot/systemd timer plus atomic JSON snapshot | Long-running service, SQLite observation/history storage and signing identity | Separate service/state/key lifecycle and resource measurements are required. |
| History | Latest attempt plus last success | Bounded enclave/container-local history | Neither is a durable public audit archive without additional retention. |
| Release tag and hub destination | Reviewed repository tags and build manifest mapped to exact measurements | Generic attestation policy and evidence | Keep our domain metadata/evidence mappings even if collection later changes. |
| Source license | Existing pinned JS primitives are MIT licensed | Workspace declares AGPL-3.0-only | Record upstream provenance/license with any future integration; no Canary code is copied in this change. |

## Bounded evaluation to do before adoption

1. Run an isolated Canary with fresh evaluation-only identity, `e2e_mode: tls`,
   60-second probes and our reviewed Zec.rocks mainnet/testnet PCR0/1/2. Do not
   generate expected values from the live endpoints. Keep it outside production
   traffic and do not publish a new service as part of this assessment.
2. Independently verify complete results with `canaryctl`, not only
   `/status.json`, `/statement`, or a standalone offline evidence check. Test
   wrong keys, either signature missing, replay/expiry, wrong nonce/PCR, debug
   measurements, wrong TLS binding, malformed data and transport failure.
3. Compare successful observations and deliberately failed attempts with the
   current observer. Differences caused by the 180-second TTL and retained
   transport-warning state must be explicit; no majority vote or fallback to
   an older green observation.
4. Measure memory/CPU/network/storage, define signing-key trust/rotation and
   retention, and review its exact-connection certificate/domain policy and
   dependency provenance before any deployment. Our source rebuild pipeline
   stays separate and review-gated.

## Source references

- [README, trust inputs, TLS mode and limitations](https://codeberg.org/caution/canary/src/commit/c5a3761798f9c438944d235551ddd192df9c1915/README.md)
- [State reducer and fixed result lifetime](https://codeberg.org/caution/canary/src/commit/c5a3761798f9c438944d235551ddd192df9c1915/crates/canary-core/src/state.rs)
- [Required PCR policy and probe interval](https://codeberg.org/caution/canary/src/commit/c5a3761798f9c438944d235551ddd192df9c1915/crates/canary-core/src/config.rs)
- [Probe transport and evidence checks](https://codeberg.org/caution/canary/src/commit/c5a3761798f9c438944d235551ddd192df9c1915/crates/canaryd/src/probe.rs)
- [Protocol specification](https://codeberg.org/caution/canary/src/commit/c5a3761798f9c438944d235551ddd192df9c1915/docs/canary-v0-spec.md)

## Suggested response to Anton (not sent)

Thanks! We didn't use Canary: the collector/dashboard uses pinned Caution
`tee-attestation-js` primitives, additional certificate checks, and the Caution CLI
for independent source rebuilds. We reviewed Canary and its signed statements and
linked evidence look useful. We'd like to compare it alongside the existing
observer, especially TLS binding, expiry and transport-failure handling.
