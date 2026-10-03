# Permanent supply history

Apply only `sql/032_chain_supply_daily.sql` on each active primary. It creates
an additive job-owned archive and records migration 032. Physical replication
copies it to mainnet standby; keep standby jobs disabled. No indexer/parser
restart, ledger rewrite, size estimate or privacy-score repair is required.

Generate a dry-run plan with the API's Node 22 runtime:

```
NODE_PATH=server/api/node_modules node server/scripts/backfill-supply-history.js --from=2016-10-28 --to=2026-10-02 --plan=/root/supply-history-plan.json
NODE_PATH=server/api/node_modules node server/scripts/backfill-supply-history.js --apply=/root/supply-history-plan.json
```

Plans are private, network/genesis-bound, and limited to 4,000 completed UTC
calendar days. Each state uses the greatest canonical height whose header time
falls before the next UTC day. The serving node's `getblock.chainSupply.chainValueZat`
is the exact integer authority, including real decreases and genesis zero.
Indexed timestamps/heights are calendar hints. Each selected state is read by canonical height from the serving node. A stale indexed fork hint is resolved against adjacent node blocks until indexed ancestry agrees; an unresolved boundary fails closed. Days without blocks
retain the last verified state, rather than interpolate or guess issuance.
The plan pins a node height/hash ancestry checkpoint before replay and rechecks it after replay and before apply. Existing archive ancestry must still match, or the entire archived range must be replayed. Apply rejects standby writes.
Existing identical rows remain unchanged. New or changed canonical states upsert
atomically; failures roll back. The archive has no retention deletion.

Install `cipherscan-supply-archive.service` and `.timer` on active mainnet and
testnet only. Set ExecStart to the actual API Node 22 executable on hosts whose
`/usr/bin/node` is older. The daily job refreshes the seven most recent completed
days; a prolonged outage requires a bounded manual replay of the missed range.

The emission endpoint defaults to all history. Reads verify the shared serving-node ancestry checkpoint and exclude the archive when that checkpoint changes and combine completed archive days with newer hourly snapshots.
An absent archive retains the previous stored-history fallback. The chart keeps
unknown gaps if any remain; dates represent UTC header-day reconstructed states,
not proof of wall-clock arrival times. Summary values use the latest stored
observation and the forecast still adds scheduled new issuance only.
