# Public API contract fixtures

Captured 2026-09-14 from:
- https://api.mainnet.cipherscan.app/api/transactions/list?limit=5
- https://api.mainnet.cipherscan.app/api/blocks?limit=5

Preserve field types, especially BIGINT strings and zatoshi amounts. Browser tests may move the timestamp while retaining its string representation so relative-clock assertions remain deterministic.
