# NU7 finalized tally fixtures

Captured from the public Valar production vote-chain API on 2026-09-15 (Australia/Brisbane).

Round: `16eef7ebc77e0e04fb1c7329abfcc390f4a0c002964671ebb360914a3e5a3f11`.

- `summary.json`: `/shielded-vote/v1/vote-summary/<round>`
- `tally.json`: `/shielded-vote/v1/tally-results/<round>`
- Host: `https://prod.vote-chain-primary.valargroup.org`

These are API-reported totals, not an independently verified tally. A unit is 0.125 ZEC (vote-sdk UI `ballotsToZEC`, revision `7c59b7cc32593ec1a596b8a007431313d7c568a5`); `ballot_count` must not be used as vote weight or unique voters. Fixtures intentionally preserve omitted protobuf zero fields.
