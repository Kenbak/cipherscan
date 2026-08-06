#!/usr/bin/env bash
set -euo pipefail

# Daily V3 Signal Pipeline
# Run via cron: 0 21 * * * /root/cipherscan/server/signals/daily-v3.sh
#
# Steps:
#   1. Update MVRV for today
#   2. Compute V3 signal
#   3. Process paper trade
#   4. Send Telegram report

cd /root/cipherscan/server/api

echo "[$(date)] Starting daily V3 pipeline..."

# 1. Update today's MVRV
echo "  Computing MVRV..."
node ../signals/compute-mvrv.js --today-only 2>&1 | tail -3

# 2. Compute V3 signal for today
echo "  Computing V3 signal..."
node ../signals/engine-v3.js 2>&1 | tail -8

# 3. Process paper trade + send report
echo "  Processing paper trade + Telegram..."
node ../signals/paper-trade.js 2>&1 | tail -20

echo "[$(date)] Done."
