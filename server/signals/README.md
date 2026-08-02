# ZEC On-Chain Trading Signals V2

Private signal engine that computes buy/sell indicators from CipherScan's on-chain data.

## V2 Changes

- **Migration-neutral SVR**: Nets out Ironwood inflows against Orchard outflows to avoid false bearish signals from pool migrations
- **Cross-chain flow fixed**: Lowered minimum swap threshold (10→5), switched to USD-denominated volumes
- **6 new indicators**: Exchange deposit velocity, whale accumulation, mean reversion, miner-to-exchange ratio, fee pressure, network momentum
- **Regime detection**: Classifies market as BULL/BEAR/RANGE, adjusts indicator weights and suppresses contrarian signals in strong trends
- **Adaptive weights**: Rolling 90d correlation analysis rebalances indicator weights every 30 days
- **Confidence score**: 0-100% based on indicator concordance, volume, and regime clarity
- **Volume multiplier**: High-volume signals are amplified, low-volume dampened
- **Walk-forward validation**: Proper quant backtesting with Sharpe, drawdown, and out-of-sample split

## Indicators (12 signals)

| Indicator | Source | Logic |
|-----------|--------|-------|
| **SVR-7d** | `shielded_flows` | Migration-neutral shielding ratio (7d). >1 = accumulation |
| **SVR-30d** | `shielded_flows` | Same, 30d window (more stable) |
| **Pool Momentum** | `privacy_trends_daily` | 7d pool growth z-score vs 30d mean |
| **Miner→Exchange** | `miner_destination_daily` | % of miner output going to exchanges vs shielding |
| **Cross-chain Flow** | `cross_chain_swaps` | Net USD inflow/outflow normalized by volume |
| **Exchange Velocity** | `turnstile_daily` | Z-score of exchange deposit rate vs 30d baseline |
| **Whale Accumulation** | `addresses` | Net flow to/from transparent whale addresses |
| **Mean Reversion** | `zec_price_daily` | Price z-score from 60d SMA (contrarian) |
| **Fee Pressure** | `blocks` | Rising avg fee/tx = genuine demand |
| **Network Momentum** | `blocks` | 7d tx count vs 30d average |
| **Shielded TX Momentum** | `privacy_trends_daily` | Rising shielded % = bullish |
| **Volume Z-Score** | `zec_price_daily` | Confidence multiplier (not directional) |

## Signal Output

| Composite Score | Signal |
|----------------|--------|
| ≥ 50 | STRONG_BUY |
| ≥ 20 | BUY |
| -20 to 20 | HOLD |
| ≤ -20 | SELL |
| ≤ -50 | STRONG_SELL |

Plus: regime (BULL/BEAR/RANGE), confidence (0-100%), volume multiplier (0.5-1.5x).

Regime suppression: SELL signals are converted to HOLD in BULL regime (unless composite < -60). BUY signals are converted to HOLD in BEAR regime (unless composite > 60).

## Usage

```bash
# First run: backfill all historical signals
node server/signals/compute.js --backfill

# Compute for today (run via cron)
node server/signals/compute.js

# Compute for specific date
node server/signals/compute.js --date 2026-06-01

# Run full backtest (7-day forward returns + OOS split)
node server/signals/backtest.js

# Backtest with 14-day horizon
node server/signals/backtest.js --horizon 14

# Walk-forward analysis only
node server/signals/backtest.js --walk-forward

# Out-of-sample split only
node server/signals/backtest.js --oos

# Hourly price fetch (set up as cron)
node server/signals/fetch-hourly-price.js
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

## Cron Setup

```
# Compute signal once per hour
0 * * * * cd /root/cipherscan/server/signals && node compute.js >> /var/log/signals.log 2>&1

# Hourly price fetch
5 * * * * cd /root/cipherscan/server/signals && node fetch-hourly-price.js >> /var/log/hourly-price.log 2>&1
```

## Schema Additions (V2)

New columns on `trading_signals`:
- `exchange_velocity`, `whale_accumulation`, `mean_reversion`, `fee_pressure`, `network_momentum` (NUMERIC)
- `volume_multiplier` (NUMERIC)
- `regime` (TEXT: BULL/BEAR/RANGE)
- `confidence` (INTEGER: 0-100)
- `weights_used` (TEXT: JSON snapshot of weights applied)

New tables:
- `signal_weight_snapshots` — stores adaptive weight history
- `zec_price_hourly` — hourly price data for vol regime detection

## Backtesting Philosophy

- No look-ahead bias: each day's signal uses only data available on that day
- Walk-forward validation: train 6 months → predict 1 month → advance
- Out-of-sample split: first 60% train, last 40% test
- Sharpe ratio (annualized) as primary quality metric
- Max drawdown + recovery time
- Per-regime performance breakdown (BULL/BEAR/RANGE)
- Per-indicator Pearson correlation against forward returns
- Compounded equity curve (not sum of returns)
- Overfitting detection: Sharpe degradation > 50% = red flag
