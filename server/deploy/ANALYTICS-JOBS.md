# UTXO analytics and signal notifications

`compute-utxo-age.js` writes completed UTC days only. Its default run recomputes
seven completed days, recovering missed runs and recent reorg changes. Use
`--days=N` (1–366), or `--from=YYYY-MM-DD --to=YYYY-MM-DD`; today/future dates
and invalid ranges fail before opening the database. Existing rows are replaced
atomically only after both read queries succeed and their source block is still
canonical on the primary.

The job reads one repeatable-read snapshot on the configured replica (or primary
when no replica is configured). It aggregates current unspent outputs once using
the existing partial index, then reconstructs historical balances from indexed
recent spending inputs/current output links. Daily cohorts preserve zatoshis and
counts as integers. Day windows are [UTC midnight, next UTC midnight); HODL ages
are measured at the last included second. CDD is in ZEC-days; average dormancy is
in days. No new index, table, migration or global database tuning is required.

The routine job uses a bounded 180-second statement/185-second client deadline.
Explicit rebuilds longer than seven days have 600/605-second read deadlines;
use a 1,500-second process limit for those one-off rebuilds. Both use 64 MB
work memory per operation and at most two parallel workers for reads. Primary
snapshot writes have a 30-second statement deadline. Keep the existing external
flock and add a 600-second process timeout to the UTXO cron command. Do not run
multiple backfills concurrently or bypass the advisory lock (839302).

After deploying the reviewed main revision to the job host, run from
`server/jobs` with the existing NODE_PATH/environment:

```sh
node compute-utxo-age.js --from=2026-08-17 --to=2026-09-08
```

This example repairs the first-to-last missing dates found on September 9. A
larger rebuild can correct earlier partial-day snapshots as well. Check row dates,
bucket sums, replication health, and both `/api/valuation/hodl-waves` and
`/api/valuation/dormancy`; these reads have a ten-minute cache. Invalidate only
the corresponding valuation cache keys after a repair, never flush Redis.

Signal jobs read `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` from their existing
job environment or `server/signals/.env` (falling back to `server/api/.env`). Store
credentials only on the server with restricted permissions; never in Git. Do
not infer a destination from a different service's credentials without confirming
where these reports belong. Both legacy and V3 senders validate configuration,
apply a 15-second HTTP deadline and reject HTTP/Telegram API failures. They never
log credential-bearing URLs. `node server/signals/notify.js --check` verifies the
bot and chat with getMe/getChat without sending a message. The V3 computation's
successful exit previously did not prove notification delivery: missing settings
silently skipped delivery, and HTTP errors were not checked.

Tests: `npm run test:server-regressions`. Set `TEST_UTXO_DATABASE_URL` to a
**disposable superuser-enabled PostgreSQL instance** to run the real SQL/oracle
and atomic-write integration tests; they create/drop an isolated fixture database.
CI provides a disposable PostgreSQL 16 service. No fixture test targets production.
