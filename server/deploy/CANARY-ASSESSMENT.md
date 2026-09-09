# Canary compatibility assessment — 2026-09-10

Reviewed upstream commit [`c5a3761798f9c438944d235551ddd192df9c1915`](https://codeberg.org/caution/canary/src/commit/c5a3761798f9c438944d235551ddd192df9c1915).
The source review below was followed by a bounded local execution on 2026-09-10.
See [the reproducible evaluation](../evaluations/canary/README.md) and
[the captured SDK regression](../evaluations/canary/BOOTPROOF-REPORT.md).
Existing monitoring remains authoritative for the public dashboard.

## Decision after execution

**Do not switch production verification to this pinned Canary build yet.** It
initially verified both Zec.rocks targets, but repeated probes rejected valid
Nitro evidence with `INVALID_SIGNATURE`. The pinned Bootproof SDK mishandles
leading-zero ES384 signature integers during COSE-to-DER conversion. The preserved
historical document passes our existing verifier and independent raw ES384
verification; a small SDK encoding patch makes Canary accept it. The patch and
regression material are prepared for review, not installed in production.

The local trial used the upstream runtime/router through a loopback adapter,
independently reproduced target PCRs, explicit TLS mode, 60-second probes and an
ephemeral in-memory signer. It generated no persistent private signing seed and
stopped automatically after five minutes. Full `canaryctl verify` checked both
signatures and linked target evidence; local signer/config trust was explicitly
TOFU, not Nitro-authenticated. Production monitor attestation requires a Caution/
Nitro deployment or an existing independently verified Canary service; deployment
access/service details have been requested from the user.

Keep the current observer and independent rebuild records. Once the SDK correction
and production monitor trust are resolved, integrate Canary as an additional proof
source first, retaining separate evidence/TLS/release states, latest transport
warnings and its own 180-second expiry. Do not use target TOFU to fill Caution
hub's missing source-backed baseline.

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

## Evaluation protocol (executed locally; production rollout still pending)

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

Thanks! Our live collector uses pinned Caution `tee-attestation-js`, additional
certificate checks, and the Caution CLI for source rebuilds. We have now trialled
Canary alongside it. Both Zec.rocks targets initially verified, and we found a
reproducible ES384 integer-encoding edge case in the pinned Bootproof SDK during
repeated checks. We have the exact public evidence and a candidate patch that
fixes it. Could you review those, and let us know whether you have a production
Canary service or deployment access we should use for the monitor?
