# zecrocks-mainnet — independently reproduced baseline

Source: `https://github.com/zecrocks/zeronym-shim-mainnet-deploy` at `a6067268a04d14f9821edf6c83d3bdd94dab3776`.
Endpoint: `tee.unsafe.zec.rocks`.

[Reproduction run](https://github.com/Kenbak/cipherscan/actions/runs/34327234175)
completed successfully on 2026-09-09. The pinned Caution CLI rebuilt the enclave
from an archive of the exact source commit and verified PCR0/1/2 and TLS binding.
The CipherScan observer then independently challenged the live endpoint.
A second activation-time challenge at `2026-09-09T08:30:07.915Z` also passed evidence,
TLS and reproduced measurements. The source archive digest was independently
regenerated from the public Git commit locally and matched the CI record.

- `candidate.json`: measurements, source/CLI pins, artifact digests and live check.
- `built-manifest.json`: actual rebuilt enclave provenance, matched to pinned inputs.
- `input-manifest.json`: unsigned build inputs, not trust by themselves.
- `trusted_hashes.json`: fresh Caution verification state with TLS binding.
- `verify.log`: source-backed verification output; initial PCR output is unverified
  until the final verification succeeds.

Generated `Containerfile.eif` SHA-256: `78bd91202072197b6d41aad0e70b2c69d5a81b3b1df01afdeb28fc1a3312c62b`.
The recipe remains in the run artifact; its framework source is pinned in the
preserved manifest. This JSON/log evidence survives the 30-day artifact expiry.

This records source/build reproduction, not a source-code security audit,
a guarantee about every wallet session, or uptime. The GitHub runner and pinned
verification toolchain remain part of the observer's trust assumptions.
