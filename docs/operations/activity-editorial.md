# Transaction activity and editorial milestones

Implemented locally on 2026-09-23; production rollout and historical count repair
are separate operational steps. No schema migration is required. The existing
`server/bot/migrations/001_social_post_outbox.sql` table must exist on mainnet.

## Counting contract

- Source: canonical `transactions` flags and Unix-second `block_time`; `blocks`
  supplies indexed transaction totals and the recorded source tip.
- Each transaction counts once across Sprout, Sapling, Orchard and Ironwood.
  Both shielded and transparent categories exclude `is_coinbase`.
- Fully shielded is the subset with `vin_count=0 AND vout_count=0`. Pool
  migrations remain included. These are transaction counts, not users,
  payments, transferred value, organic adoption, or an explanation of causes.
- Days use UTC midnight inclusive to the following midnight exclusive. Today's
  privacy chart row remains partial; records use completed Monday–Sunday weeks.
- Historical comparison starts 2016-10-31 (first full mainnet week). The launch
  partial week and the current incomplete week never participate in rankings.
- A two-hour settling delay makes the previous week eligible Monday 02:00 UTC.
  This accommodates the existing mainnet anomaly cron at 05:30 server local
  time (03:30 UTC during summer); it is not a consensus finality guarantee.

## Source integrity and daily statistics

`transaction-activity.js` reads tip, coverage and aggregates in one repeatable-read,
read-only transaction. A tip older than 30 minutes, more than two hours ahead,
or a mismatch between per-day indexed transaction rows and block transaction
totals rejects the result. Historical ranking also requires contiguous block
heights from genesis. Zero counts are valid only with reconciled source data;
unavailable data must not produce record copy. These checks validate indexed
coverage, not the correctness of the underlying decoder's classification flags.

The hourly privacy writer now writes UTC counts for today and reconciles the
previous seven days. Count repair preserves historical pool balances, chain
supply, privacy scores and observation timestamps. Missing snapshot rows remain
missing rather than receiving invented historical balances. Lifetime shielded
counts and rolling activity use the same four-pool/coinbase predicate; the
lifetime shielded percentage denominator is non-coinbase transactions. The
separate total transaction counter still includes coinbase.

The anomaly detector evaluates yesterday UTC. Its three transaction metrics
read exact daily activity directly, so uncorrected legacy trend rows cannot
contaminate their baseline. Other metrics retain their own sources; missing
target-date observations are skipped instead of relabeling an older observation.
Z-scores compare the target against up to 90 preceding calendar days (at least
14 prior observations), excluding the target from its own baseline. Zero-variance
baselines remain unavailable. Old anomaly records and posted tweets are not
rewritten by the count-only repair.

## Draft detection and review

The existing daily `detect-anomalies.js` job also calls
`draft-activity-milestones.js`; no bot restart or new schedule is needed after
deploying these job/library files. Weekly drafts are restricted to database
`zcash_explorer_mainnet`.

A metric is noteworthy at 1,000 or more weekly transactions and any of:
top-ten historical rank, no previous equal-or-higher week, at least 52 weeks
since an equal-or-higher week, or at least 100% week-over-week growth. The
two metrics are any shielded component and fully shielded. Competition ranking
preserves ties; a zero prior week yields no percentage growth claim.

One row per week is stored as `post_type=activity_milestone_draft`,
`status=draft`, key `activity_week:v1:YYYY-MM-DD`. Metadata includes definitions,
exclusive UTC boundary, source tip/hash/time, all complete weekly chart points,
both counts, previous counts, exact percentage changes, ranks/ties, last
equal-or-higher weeks and alternative copy. Every daily rerun refreshes unreviewed
drafts; a no-longer-noteworthy draft becomes `withdrawn` and can be reactivated
if it qualifies again. Other statuses (including human-reviewed rows) are never
overwritten. The existing posting jobs do not drain these rows, and the new code
has no X client or automatic publication/notification channel.

Run from the deployed repository with the existing jobs/API DB environment:

```sh
# Read-only preview (no outbox insertion).
node server/jobs/draft-activity-milestones.js --preview

# Explicitly generate/update the review queue without posting.
node server/jobs/draft-activity-milestones.js

# Read the queue and export Markdown copy, JSON evidence and an SVG chart.
node server/scripts/review-activity-drafts.js --output=/tmp/activity-review

# Preview the count-only historical repair. End is exclusive.
node server/scripts/repair-activity-counts.js --start=2016-10-31 --end=2026-09-23

# Apply only after examining that preview; use the rollout day's UTC date as end.
node server/scripts/repair-activity-counts.js --start=2016-10-31 --end=2026-09-23 --apply
```

Review output marks captures older than 36 hours stale. Re-run the detector
before using stale copy. Keep the evidence timestamp and definitions attached
when selecting/editing a draft; posting remains a separate human action.
Arrange review of this queue in the editorial workflow; log lines alone are
not a delivery channel to the owner.

## Verification and rollout

`npm run test:activity` exercises pure rules. Set `ACTIVITY_TEST_POSTGRES=1`
for a local PostgreSQL server on `/tmp`, or `TEST_ACTIVITY_DATABASE_URL` for CI,
to also run the isolated database fixture. The CI backend job runs both.

Read-only production-replica verification on 2026-09-23 reconciled 3,612 days
(516 complete weeks) through 2026-09-20, with zero daily transaction-total
mismatches. The generated September 14 draft reproduced 62,379 shielded-component
transactions (rank 4; previous 28,227; last equal-or-higher week 2022-08-01) and
30,881 fully shielded transactions (rank 10; previous 11,362; last equal-or-higher
week 2022-08-08). The chart was rendered and visually checked.

Rollout: deploy the scoped jobs/libraries/scripts; preview the draft and historical
count repair; apply the count repair; verify the next hourly/day jobs and review
queue. Existing historic anomaly rows remain a separately scoped reconciliation
because revising them can interact with the live social bot. No new public URL,
SEO policy, API shape, node/indexer deployment or migration is introduced here.
