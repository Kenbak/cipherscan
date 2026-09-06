'use strict';
function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function valuationRow(r) {
  return {
    date: r.date,
    priceUsd: nullableNumber(r.price_usd), realizedPrice: nullableNumber(r.realized_price),
    mvrv: nullableNumber(r.mvrv), sopr: nullableNumber(r.sopr),
    soprSource: nullableNumber(r.sopr) === null ? 'unavailable' : 'transparent_spends',
    shieldedCostBasisRatio: nullableNumber(r.shielded_sopr), nupl: nullableNumber(r.nupl),
    marketCapUsd: nullableNumber(r.market_cap_usd), realizedCapUsd: nullableNumber(r.realized_cap_usd),
    transparentRealizedCapUsd: nullableNumber(r.transparent_realized_cap_usd), shieldedRealizedCapUsd: nullableNumber(r.shielded_realized_cap_usd),
  };
}
module.exports = { nullableNumber, valuationRow };
