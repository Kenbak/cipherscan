# Q3 2026 grants finalized API regression

Captured September 30, 2026 from `https://prod.vote-chain-primary.valargroup.org/shielded-vote/v1`:

- `round.json`: the matching entry from `/rounds`
- `summary.json`: `/vote-summary/2cba66eb16c7581a1692cb0b033785da0131059f645a0d2fb4dc2a5131505e01`
- `tally.json`: `/tally-results/2cba66eb16c7581a1692cb0b033785da0131059f645a0d2fb4dc2a5131505e01`

37 proposals have 148 options, but the sparse tally contains 147 rows. Proposal 3, decision 2 has no tally row and its summary omits the protobuf-default zero total. The complete finalized summary must agree with every nonzero tally value. These public API fixtures are not a claim of independent cryptographic verification.
