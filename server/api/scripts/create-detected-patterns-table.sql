-- ============================================================================
-- DETECTED PATTERNS TABLE
-- Stores pre-computed privacy risk patterns for fast API access
-- ============================================================================

-- Main table for storing detected patterns
CREATE TABLE IF NOT EXISTS detected_patterns (
  id SERIAL PRIMARY KEY,

  -- Pattern identification
  pattern_type VARCHAR(50) NOT NULL,  -- 'BATCH_DESHIELD', 'ROUND_TRIP', 'CONSOLIDATION', etc.
  pattern_hash VARCHAR(64) UNIQUE,    -- SHA256 hash of txids to prevent duplicates

  -- Scoring
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  warning_level VARCHAR(10) NOT NULL CHECK (warning_level IN ('HIGH', 'MEDIUM', 'LOW')),

  -- Transaction references
  shield_txids TEXT[],                -- Array of shield transaction IDs
  deshield_txids TEXT[],              -- Array of deshield transaction IDs

  -- Amounts
  total_amount_zat BIGINT,            -- Total amount involved
  per_tx_amount_zat BIGINT,           -- Per-transaction amount (for batch patterns)
  batch_count INTEGER,                -- Number of transactions in batch

  -- Timing
  first_tx_time INTEGER,              -- Unix timestamp of first transaction
  last_tx_time INTEGER,               -- Unix timestamp of last transaction
  time_span_hours NUMERIC(10, 2),     -- Hours between first and last tx

  -- Metadata (JSON for flexibility)
  metadata JSONB,                     -- Full pattern details, breakdown, explanation

  -- Audit
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- For cleanup
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '90 days')
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_patterns_type ON detected_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_patterns_score ON detected_patterns(score DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_warning ON detected_patterns(warning_level);
CREATE INDEX IF NOT EXISTS idx_patterns_detected_at ON detected_patterns(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_first_time ON detected_patterns(first_tx_time DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_expires ON detected_patterns(expires_at);

-- GIN index for searching txids
CREATE INDEX IF NOT EXISTS idx_patterns_shield_txids ON detected_patterns USING GIN(shield_txids);
CREATE INDEX IF NOT EXISTS idx_patterns_deshield_txids ON detected_patterns USING GIN(deshield_txids);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_patterns_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamp
DROP TRIGGER IF EXISTS patterns_updated_at ON detected_patterns;
CREATE TRIGGER patterns_updated_at
  BEFORE UPDATE ON detected_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_patterns_timestamp();

-- View for easy querying of recent high-risk patterns
CREATE OR REPLACE VIEW high_risk_patterns AS
SELECT
  id,
  pattern_type,
  score,
  warning_level,
  total_amount_zat / 100000000.0 as total_amount_zec,
  per_tx_amount_zat / 100000000.0 as per_tx_amount_zec,
  batch_count,
  time_span_hours,
  shield_txids,
  deshield_txids,
  metadata->>'explanation' as explanation,
  detected_at
FROM detected_patterns
WHERE warning_level = 'HIGH'
  AND expires_at > NOW()
ORDER BY score DESC, detected_at DESC;

-- Cleanup function (call periodically to remove old patterns)
CREATE OR REPLACE FUNCTION cleanup_expired_patterns()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM detected_patterns WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Stats view
CREATE OR REPLACE VIEW pattern_stats AS
SELECT
  pattern_type,
  warning_level,
  COUNT(*) as count,
  AVG(score) as avg_score,
  SUM(total_amount_zat) / 100000000.0 as total_zec_flagged
FROM detected_patterns
WHERE expires_at > NOW()
GROUP BY pattern_type, warning_level
ORDER BY pattern_type, warning_level;

COMMENT ON TABLE detected_patterns IS 'Pre-computed privacy risk patterns detected by background scanner';
COMMENT ON COLUMN detected_patterns.pattern_hash IS 'SHA256 of sorted txids to prevent duplicate detection';
COMMENT ON COLUMN detected_patterns.metadata IS 'Full pattern details including breakdown and explanation';
