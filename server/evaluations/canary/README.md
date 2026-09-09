# Canary evaluation

**Outcome:** the trial found a reproducible false signature rejection in the
pinned Bootproof SDK. See [the report](BOOTPROOF-REPORT.md), candidate patch and
[recorded results](results.json). Production monitoring remains on our collector.

This evaluates pinned Canary `c5a3761798f9c438944d235551ddd192df9c1915`
without replacing CipherScan's collector, publishing a service, or changing the
production endpoint registry. Upstream code is AGPL-3.0-only; its source and license
remain in the evaluation checkout. No upstream verifier implementation is vendored.

`config.mjs` exports the two independently reproduced Zec.rocks baselines from the
registry, with explicit TLS binding and 60-second probes. `--negative-control`
adds a duplicate mainnet target with a deliberately wrong PCR0; that target must
fail. It never derives expected measurements from live responses.

`loopback.rs` is an evaluation adapter around Canary's public `Runtime` and HTTP
router. It keeps the production probe implementation, scheduler, store and signing
code. Only paths, listener (127.0.0.1), ephemeral identity and bounded shutdown are
selected by the adapter. The unmodified upstream daemon assumes `/app`, root-level
metadata, and port 8080 on all interfaces, which are inappropriate for this local
trial. No persistent private signing seed is written.

## Prepare

Needs Git, Node, Rust >=1.88 and a C compiler. Preparation creates a new directory,
uses its own Cargo cache/build output, runs the locked upstream tests serially and builds
the adapter plus upstream CLI:

```sh
server/evaluations/canary/prepare.sh /private/tmp/cipherscan-canary-trial
```

## Run and independently verify

In one terminal (240-second lifetime, no automatic restart):

```sh
trial=/private/tmp/cipherscan-canary-trial
"$trial/target/debug/examples/cipherscan-evaluate" \
  "$trial/canary.json" "$trial/state" 3187 240
```

In another terminal:

```sh
trial=/private/tmp/cipherscan-canary-trial
cli="$trial/target/debug/canaryctl"
"$cli" save-canary-keys --canary-url http://127.0.0.1:3187 \
  --skip-canary-attestation --allow-http --output "$trial/keys.json"
"$cli" verify --canary-url http://127.0.0.1:3187 \
  --skip-canary-attestation --allow-http --trusted-keys "$trial/keys.json" \
  --target zecrocks-mainnet --target zecrocks-testnet --json
"$cli" verify --canary-url http://127.0.0.1:3187 \
  --skip-canary-attestation --allow-http --trusted-keys "$trial/keys.json" \
  --target negative-wrong-pcr --json
```

Initial results may be PENDING until scheduled probes complete. The positive check
must return exit 0 and both targets VERIFIED with authenticated PCR and TLS data;
the negative control must return nonzero with authenticated FAILED/PCR mismatch,
not a read error. Repeat across at least two probe cycles. `verify` validates both
signatures and linked evidence; reading `status.json` alone is insufficient.

These explicit local flags trust the locally pinned signer and local configuration;
they do **not** authenticate Canary's own code/configuration through Nitro.
Target policy is independently supplied from our reproduced registry. Do not use
these flags to claim an attested production Canary monitor. A production rollout
needs an explicit signer/config trust and rotation model, deployment environment,
resource limits and retained-evidence policy.

Save observations under the trial directory, not the repository. Compare target
measurements and TLS bindings with both existing public network APIs. Different
nonces, timestamps and document digests between independent probes are expected.
Record run results and the adoption decision in `server/deploy/CANARY-ASSESSMENT.md`.

For scripted acceptance after the first probes complete:

```sh
python3 server/evaluations/canary/check-live.py \
  "$trial/target/debug/canaryctl" http://127.0.0.1:3187 "$trial/acceptance"
```

This saves complete CLI outputs and public evidence, checks the two positive
targets and the wrong-PCR control, then rejects removed/corrupted signatures of
either algorithm and a wrong signing key. Offline statement checks are explicitly
partial; they supplement the complete live verification rather than replacing it.
Repeat full verification before expiry and confirm a saved statement is rejected
after its original `expires_at`; do not rewrite times or re-sign the fixture.

Canary transport warnings require separate attention: a recent VERIFIED statement
can survive a subsequent timeout until expiry. The upstream reducer tests cover
this and the three-failure unreachable threshold. Production integration must
retain the latest attempt/warning and Canary's 180-second expiry, independently of
CipherScan's 900-second window. Never translate VERIFIED into unconditional green.
