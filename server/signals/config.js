/**
 * Trading Signals V2 — Configuration
 *
 * All indicator scores are normalized to [-100, +100].
 * Composite = regime-weighted average of available indicators, modified by confidence.
 */

module.exports = {
  // Default indicator weights (sum to 1.0, overridden by adaptive weights when available)
  weights: {
    svr_7d: 0.12,
    svr_30d: 0.10,
    pool_momentum: 0.10,
    miner_exchange: 0.08,
    crosschain_flow: 0.10,
    shielded_tx_momentum: 0.05,
    exchange_velocity: 0.12,
    whale_accumulation: 0.08,
    mean_reversion: 0.10,
    fee_pressure: 0.05,
    network_momentum: 0.05,
    volume_zscore: 0.05,
  },

  // SVR (Shielded Velocity Ratio) — migration-neutral
  svr: {
    neutralRatio: 1.0,
    minRatio: 0.5,
    maxRatio: 2.0,
  },

  // Pool Momentum
  poolMomentum: {
    lookbackDays: 30,
    shortWindow: 7,
    zScoreClamp: 3.0,
  },

  // Miner-to-Exchange Ratio (replaces crude miner_pressure)
  minerExchange: {
    windowDays: 7,
    // High exchange ratio = bearish (miners dumping to sell)
    // Low exchange ratio = bullish (miners holding/shielding)
    neutralPct: 30,
    zScoreClamp: 3.0,
  },

  // Cross-chain Flow (USD-denominated, lowered threshold)
  crosschainFlow: {
    windowDays: 7,
    minSwaps: 5,
    normClamp: 3.0,
  },

  // Shielded TX Momentum
  shieldedTxMomentum: {
    shortWindow: 7,
    longWindow: 30,
    maxDelta: 10,
  },

  // Exchange Deposit Velocity
  exchangeVelocity: {
    lookbackDays: 30,
    shortWindow: 7,
    zScoreClamp: 3.0,
  },

  // Whale Accumulation
  whaleAccumulation: {
    minBalance: 100000000000, // 1000 ZEC in zatoshis
    lookbackDays: 14,
    zScoreClamp: 3.0,
  },

  // Mean Reversion (Price Z-Score from 60d SMA)
  meanReversion: {
    smaDays: 60,
    zScoreClamp: 3.0,
  },

  // Fee Market Pressure
  feePressure: {
    shortWindow: 7,
    longWindow: 30,
    zScoreClamp: 3.0,
  },

  // Network Activity Momentum
  networkMomentum: {
    shortWindow: 7,
    longWindow: 30,
    zScoreClamp: 3.0,
  },

  // Volume Z-Score (confidence multiplier, not directional)
  volumeZscore: {
    lookbackDays: 30,
  },

  // Regime detection
  regime: {
    smaDays: 30,
    volDays: 30,
    slopeThreshold: 0.005, // daily % change threshold for trend
    volHighThreshold: 0.04, // daily vol > 4% = high volatility
  },

  // Composite signal thresholds
  thresholds: {
    strongBuy: 50,
    buy: 20,
    sell: -20,
    strongSell: -50,
  },

  // Adaptive weights
  adaptiveWeights: {
    correlationWindow: 90,
    recomputeEveryDays: 30,
    minCorrelation: 0.02, // indicators below this get minimum weight
    minWeight: 0.02,
  },
};
