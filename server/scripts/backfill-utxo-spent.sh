#!/usr/bin/env bash
set -euo pipefail

# UTXO Spend Backfill — Parallel Worker
#
# Marks transparent outputs as spent by joining against transaction_inputs.
# Processes a contiguous block-height range in 5K-block batches.
#
# Usage:
#   ./backfill-utxo-spent.sh <start_height> <end_height> [batch_size]
#
# Example (4 parallel workers):
#   ./backfill-utxo-spent.sh 0       850000  5000 &
#   ./backfill-utxo-spent.sh 850000  1700000 5000 &
#   ./backfill-utxo-spent.sh 1700000 2550000 5000 &
#   ./backfill-utxo-spent.sh 2550000 3440000 5000 &
#   wait

DB_NAME="${DB_NAME:-zcash_explorer_mainnet}"
DB_USER="${DB_USER:-postgres}"
BATCH_SIZE="${3:-5000}"
START="${1:?Usage: $0 <start_height> <end_height> [batch_size]}"
END="${2:?Usage: $0 <start_height> <end_height> [batch_size]}"

STATE_DIR="/tmp/utxo-spent-backfill"
mkdir -p "$STATE_DIR"
STATE_FILE="${STATE_DIR}/worker_${START}_${END}.state"

if [[ -f "$STATE_FILE" ]]; then
  CURRENT=$(cat "$STATE_FILE")
  echo "Resuming from checkpoint: $CURRENT (range $START to $END)"
else
  CURRENT="$START"
  echo "Starting range $START to $END (batch=$BATCH_SIZE)"
fi

TOTAL_BLOCKS=$((END - START))
UPDATED_TOTAL=0
START_TIME=$(date +%s)

while (( CURRENT < END )); do
  BATCH_END=$((CURRENT + BATCH_SIZE))
  if (( BATCH_END > END )); then
    BATCH_END=$END
  fi

  RESULT=$(sudo -u "$DB_USER" psql -d "$DB_NAME" -t -A -c "
    UPDATE transaction_outputs o
    SET spent = TRUE,
        spent_txid = i.txid,
        spent_at = to_timestamp(t.block_time)
    FROM transaction_inputs i
    JOIN transactions t ON t.txid = i.txid
    WHERE i.prev_txid = o.txid
      AND i.prev_vout = o.vout_index
      AND o.txid IN (SELECT txid FROM transactions WHERE block_height >= $CURRENT AND block_height < $BATCH_END)
      AND o.spent = FALSE;
  " 2>&1)

  ROWS=$(echo "$RESULT" | grep -oP 'UPDATE \K\d+' || echo "0")
  UPDATED_TOTAL=$((UPDATED_TOTAL + ROWS))

  echo "$BATCH_END" > "$STATE_FILE"

  DONE=$((BATCH_END - START))
  PCT=$(echo "scale=1; $DONE * 100 / $TOTAL_BLOCKS" | bc)
  NOW=$(date +%s)
  ELAPSED=$((NOW - START_TIME))
  if (( ELAPSED > 0 )); then
    RATE=$(echo "scale=0; $DONE / $ELAPSED" | bc)
    REMAINING=$(echo "scale=0; ($TOTAL_BLOCKS - $DONE) / ($RATE + 1)" | bc)
  else
    RATE=0
    REMAINING=0
  fi

  echo "[$START-$END] ${PCT}% | blocks ${CURRENT}-${BATCH_END} | ${ROWS} rows | total: ${UPDATED_TOTAL} | ${RATE} blk/s | ETA: ${REMAINING}s"

  CURRENT=$BATCH_END
done

rm -f "$STATE_FILE"

FINAL_TIME=$(date +%s)
TOTAL_ELAPSED=$((FINAL_TIME - START_TIME))
echo "Worker $START-$END complete! Updated: ${UPDATED_TOTAL} rows in ${TOTAL_ELAPSED}s"
