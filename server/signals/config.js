/**
 * Trading Signals — Configuration
 * Weights, thresholds, and parameters for signal computation.
 *
 * All indicator scores are normalized to [-100, +100].
 * Composite = weighted average of all available indicators.
 */

module.exports = {
  // Indicator weights (must sum to 1.0)
  weights: {
    svr_7d: 0.25,
    svr_30d: 0.20,
    pool_momentum: 0.20,
    miner_pressure: 0.15,
    crosschain_flow: 0.10,
    shielded_tx_momentum: 0.10,
  },

  // SVR (Shielded Velocity Ratio) parameters
  svr: {
    // Ratio = shielded_zat / deshielded_zat over window
    // > 1.0 means net accumulation, < 1.0 means net distribution
    // Score mapping: ratio 0.5 → -100, ratio 1.0 → 0, ratio 2.0 → +100
    neutralRatio: 1.0,
    minRatio: 0.5,   // maps to -100
    maxRatio: 2.0,   // maps to +100
  },

  // Pool Momentum parameters
  poolMomentum: {
    // Compares current 7d pool growth rate vs 30d average growth rate
    // Score = z-score of 7d rate vs 30d mean, clamped to [-100, +100]
    lookbackDays: 30,
    shortWindow: 7,
    zScoreClamp: 3.0, // ±3 std devs → ±100
  },

  // Miner Sell Pressure (Contrarian)
  minerPressure: {
    // Percentage of earned ZEC spent within the observation window
    // Contrarian: miners selling aggressively = buy opportunity (they create dips)
    // Miners holding = supply overhang building (eventual sell pressure)
    // 100% spent → +100 (bullish), 0% spent → -100 (bearish)
    neutralSpendPct: 50,
  },

  // Cross-chain Flow parameters
  crosschainFlow: {
    // Net ZEC value: inflows - outflows over window
    // Positive = demand (bullish), negative = exits (bearish)
    windowDays: 7,
    // Normalize by dividing by median daily volume, clamp at ±3x
    normClamp: 3.0,
  },

  // Shielded TX Momentum parameters
  shieldedTxMomentum: {
    // Compare current 7d avg shielded_percentage vs 30d avg
    // Rising privacy usage = bullish
    shortWindow: 7,
    longWindow: 30,
    maxDelta: 10, // ±10 percentage points → ±100
  },

  // Composite signal thresholds
  thresholds: {
    strongBuy: 50,
    buy: 20,
    sell: -20,
    strongSell: -50,
  },
};
