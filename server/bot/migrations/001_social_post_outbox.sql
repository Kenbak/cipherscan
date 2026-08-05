-- social_post_outbox: deduplication, audit trail, and idempotent posting
-- Run once on the mainnet database (zcash_explorer_mainnet)

CREATE TABLE IF NOT EXISTS social_post_outbox (
  id            BIGSERIAL PRIMARY KEY,
  post_type     TEXT NOT NULL,
  dedup_key     TEXT NOT NULL UNIQUE,
  content       TEXT NOT NULL,
  metadata      JSONB DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'pending',
  x_post_id     TEXT,
  error_message TEXT,
  attempts      INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_at     TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_status ON social_post_outbox(status);
CREATE INDEX IF NOT EXISTS idx_outbox_type_created ON social_post_outbox(post_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbox_dedup ON social_post_outbox(dedup_key);

COMMENT ON TABLE social_post_outbox IS 'Audit trail and deduplication for the CipherScan data bot. Each row = one intended post.';
COMMENT ON COLUMN social_post_outbox.dedup_key IS 'Deterministic key ensuring the same event is never posted twice. Format: {type}:{identifier}';
COMMENT ON COLUMN social_post_outbox.metadata IS 'Structured context: block_height, amount_zat, percentile, pool, direction, etc.';
