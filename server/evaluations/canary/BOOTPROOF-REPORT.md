# Valid ES384 evidence rejected after COSE-to-DER integer conversion

Prepared for the operator/maintainer; **not sent**. This is a false rejection of
valid evidence, not evidence of a compromised Zec.rocks endpoint or a demonstrated
signature-verification bypass.

- Canary: `c5a3761798f9c438944d235551ddd192df9c1915`.
- Pinned Bootproof SDK: `78f531a2c245404a9d8879fb71cc397096ae0077`.
- Location: `crates/bootproof-sdk/src/format/nitro.rs`, `asn1_encode_int`.
- Captured endpoint: `https://tee.testnet.unsafe.zec.rocks/attestation`.
- Observation: `2026-09-09T22:14:38Z`.
- Raw document SHA-256: `7dc2abf943d2d9a7ce6fc9c83cf863a757fb1d05d0fd52289ef1bcc12ef9e125`.
- Preserved public bundle: `fixtures/testnet-leading-zero-evidence.json`.
- Independently reproduced expected measurements: `fixtures/testnet-pcrs.json`,
  matching the testnet baseline in CipherScan's registry at main `49de30d`.

## Reproduction

Using the unmodified pinned Canary CLI:

```sh
canaryctl verify-evidence \
  --evidence server/evaluations/canary/fixtures/testnet-leading-zero-evidence.json \
  --expected-pcrs server/evaluations/canary/fixtures/testnet-pcrs.json --json
```

Actual: exit 1, `INVALID_SIGNATURE`. Expected: historical evidence verifies.
This command is an offline **partial** evidence check, not proof of current
endpoint health or verification of the monitor itself.

The same document passes CipherScan's pinned Caution JS verifier (certificate
signatures, COSE signature, nonce and expected PCRs). CipherScan's separate
OpenSSL certificate path verification also passed when the document was captured.
An independent Node/OpenSSL ES384 check accepts its raw IEEE-P1363 signature,
rejects the old conversion's DER bytes and accepts corrected DER bytes:

```sh
node server/evaluations/canary/reproduce-encoding.mjs
```

The raw S component begins `00 d2 6b ad 2b`. The SDK tests the high bit of the
original first byte (`00`), strips leading zeros, then emits the resulting `d2…`
without a positive-sign prefix. DER interprets that integer as negative. After
trimming unsigned fixed-width padding, the encoder must test the first retained
byte and prefix `00` when its high bit is set.

## Candidate fix

`bootproof-der-sign.patch` strips padding before the existing sign test, with
regression cases for padded high-bit values, unpadded high-bit values, ordinary
positive values, all-zero input and empty input. It applies to the pinned SDK
checkout with `git apply`. No signature checks are skipped and no failure is
converted into an unconditional success.

A separate local Canary checkout with a Cargo path override to the patched SDK
accepts the exact captured bundle. Its lockfile differs only by replacing the
pinned SDK source with that local checkout; all other dependency versions remain
unchanged. This is an evaluation patch, **not deployed** and not an upstream merge.

## Trial context

A bounded five-minute loopback trial checked two reproduced Zec.rocks targets and
one deliberately incorrect mainnet PCR policy every 60 seconds. The first complete
CLI verification passed both positive targets, including TLS binding, and rejected
the negative control. Repeated checks then exposed this intermittent encoding
failure on testnet. The next testnet probe recovered. This is why a single passing
probe or a generic VERIFIED badge is insufficient for adoption.

The full pinned upstream suite passed 245 tests serially. An initial parallel run
had one two-second webhook-delivery timeout; it passed serially. Both explicit
upstream live TLS acceptance tests also passed individually. The live trial does
not establish a false-rejection rate or production performance on other hardware.

To evaluate the patch without changing an installed dependency, use separate clean
checkouts at the commits above, apply the patch in the Bootproof checkout, and add
this evaluation-only override to Canary's `Cargo.toml` (substitute the local path):

```toml
[patch."https://codeberg.org/caution/bootproof.git"]
bootproof-sdk = { path = "/path/to/bootproof/crates/bootproof-sdk" }
```

Build `canaryctl`, confirm the lockfile changes only the SDK source, and rerun the
same frozen-bundle command. The local patched build returns exit 0 with
`partial: true`. Both the unmodified and patched Canary workspaces pass all 245
serial tests. All 11 patched Bootproof SDK tests pass, including the new DER
regression with six boundary cases.
This does not make the historical bundle fresh, nor authenticate a deployed
Canary monitor's identity.
