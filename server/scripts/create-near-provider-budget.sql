-- One conservative shared quota for known mainnet Explorer consumers.
BEGIN;
SET LOCAL lock_timeout='2s';
CREATE TABLE IF NOT EXISTS crosschain_provider_budget (
 id integer PRIMARY KEY CHECK(id=1),
 not_before timestamptz NOT NULL DEFAULT clock_timestamp(),
 requests bigint NOT NULL DEFAULT 0,
 throttled bigint NOT NULL DEFAULT 0,
 last_status integer,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO crosschain_provider_budget(id) VALUES(1) ON CONFLICT DO NOTHING;
COMMIT;
