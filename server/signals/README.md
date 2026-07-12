# ZEC On-Chain Trading Signals

Private signal engine that computes buy/sell indicators from CipherScan's on-chain data.

## Indicators

| Indicator | Source | Logic |
|-----------|--------|-------|
| **SVR-7d** | `shielded_flows` | Shielding vs deshielding ratio (7-day window). >1 = accumulation |
| **SVR-30d** | `shielded_flows` | Same as above, 30-day window (slower, more stable) |
| **Pool Momentum** | `privacy_trends_daily` | 7d pool growth rate vs 30d average (z-score) |
| **Miner Pressure** | `mining_behavior_daily` | % of mined ZEC sold within 7 days. High = bearish |
| **Cross-chain Flow** | `cross_chain_swaps` | Net ZEC inflow from other chains. Positive = demand |
| **Shielded TX Momentum** | `privacy_trends_daily` | 7d avg shielded % vs 30d avg. Rising = bullish |

Each indicator produces a score in [-100, +100]. The composite is a weighted average.

## Signals

| Composite Score | Signal |
|----------------|--------|
| ≥ 50 | STRONG_BUY |
| ≥ 20 | BUY |
| -20 to 20 | HOLD |
| ≤ -20 | SELL |
| ≤ -50 | STRONG_SELL |

## Usage

```bash
# First run: backfill all historical signals
node server/signals/compute.js --backfill

# Compute for today (run via cron)
node server/signals/compute.js

# Compute for specific date
node server/signals/compute.js --date 2026-06-01

# Run backtest (7-day forward returns)
node server/signals/backtest.js

# Run backtest with 14-day horizon
node server/signals/backtest.js --horizon 14
```

## API (private, requires X-Service-Key)

```bash
# Latest signal + 7-day history
curl -H "X-Service-Key: $KEY" https://api.mainnet.cipherscan.app/api/signals/latest

# Full history (last 90 days)
curl -H "X-Service-Key: $KEY" https://api.mainnet.cipherscan.app/api/signals/history?days=90

# Performance stats per signal bucket
curl -H "X-Service-Key: $KEY" https://api.mainnet.cipherscan.app/api/signals/performance?horizon=7
```

## Cron

```
0 * * * * cd /root/cipherscan/server/signals && node compute.js >> /var/log/signals.log 2>&1
```

## Backtesting Philosophy

- No look-ahead bias: each day's signal uses only data available on that day
- Forward returns measured at configurable horizons (7d default)
- Pearson correlation reported per-indicator to identify predictive power
- Win rate and average return reported per signal bucket
- Strategy simulation: long on BUY/STRONG_BUY, short on SELL/STRONG_SELL, flat on HOLD
