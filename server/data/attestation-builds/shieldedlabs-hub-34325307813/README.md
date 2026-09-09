# Shielded Labs hub — independently reproduced baseline

Source: `https://github.com/ShieldedLabs/zero-hub` at
`5b98e661be90180433bea09533a4c096d4e7f203`.
Endpoint: `zeronym-hub-9.shieldedinfra.net` (mainnet).

[Reproduction run](https://github.com/Kenbak/cipherscan/actions/runs/34325307813)
completed successfully on 2026-09-09. The pinned Caution CLI rebuilt the enclave
from an archive of the exact source commit, matched PCR0/1/2 and verified TLS.
The CipherScan observer then independently challenged the live endpoint and
confirmed the reproduced measurements. A second activation-time challenge at
2026-09-09T08:05:35.658Z also passed evidence, TLS and release comparison.

- `candidate.json`: measurements, source/CLI pins, artifact digests and live check.
- `built-manifest.json`: actual rebuilt enclave provenance, matched to pinned inputs.
- `input-manifest.json`: the unsigned metadata used as build inputs (not trust by itself).
- `trusted_hashes.json`: fresh Caution verification state, including TLS binding.
- `verify.log`: source-backed verification output; initial displayed PCRs are explicitly
  unverified until the final verification succeeds.

The generated `Containerfile.eif` remains in the run artifact; SHA-256:
`78bd91202072197b6d41aad0e70b2c69d5a81b3b1df01afdeb28fc1a3312c62b`. Its framework source is pinned in the preserved manifest.
The retained JSON/log evidence here survives GitHub's 30-day artifact retention.

This records a successful source/build reproduction, not a source-code security
audit, proof of every wallet session, or an uptime guarantee. The GitHub runner
and pinned verification toolchain remain part of the observer's trust assumptions.
