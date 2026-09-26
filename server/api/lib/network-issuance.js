const ZAT_PER_ZEC = 100_000_000;
const MAX_SUPPLY_ZAT = 21_000_000 * ZAT_PER_ZEC;

/** PostgreSQL bigint values are strings. Missing or malformed values are not zero. */
function supplyZat(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= MAX_SUPPLY_ZAT ? parsed : null;
}

/** RPC subsidy amounts are ZEC, but comparisons must respect zatoshi rounding. */
function subsidyZat(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 21_000_000) return null;
  const fixed = value.toFixed(8);
  if (Number(fixed) !== value) return null;
  return supplyZat(Math.round(value * ZAT_PER_ZEC));
}

function supplyHistory(rows, source) {
  return rows.map(row => {
    const parsed = supplyZat(source === 'chain_snapshots' ? row.chain_supply_zat : row.chain_supply);
    // Existing snapshot jobs store zero when chain supply is unavailable.
    // These modern history tables cannot distinguish that sentinel from zero.
    const zat = parsed === 0 ? null : parsed;
    const date = source === 'chain_snapshots' ? row.snapshot_time : row.date;
    return {
      date,
      circulating: zat === null ? null : zat / ZAT_PER_ZEC,
      circulatingZat: zat,
      ...(source === 'chain_snapshots' ? { height: supplyZat(row.block_height) } : {}),
    };
  }).filter(point => point.date != null && Number.isFinite(new Date(point.date).getTime()))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

/** Daily net supply movement is not gross issuance. Do not bridge missing days. */
function dailyNetSupplyChanges(rows) {
  const points = supplyHistory(rows, 'privacy_trends_daily');
  return points.slice(1).map((point, index) => {
    const previous = points[index];
    const consecutive = new Date(point.date).getTime() - new Date(previous.date).getTime() === 86_400_000;
    const zat = consecutive && point.circulatingZat !== null && previous.circulatingZat !== null
      ? point.circulatingZat - previous.circulatingZat : null;
    return { date: point.date, emission: zat === null ? null : zat / ZAT_PER_ZEC, emissionZat: zat };
  });
}

/** An observed cadence, not a consensus target or a prediction across upgrades. */
async function observedBlockCadence(pool, currentHeight) {
  if (!Number.isSafeInteger(currentHeight) || currentHeight < 1) return null;
  const { rows } = await pool.query(
    'SELECT height, timestamp FROM blocks WHERE height <= $1 ORDER BY height DESC LIMIT 121',
    [currentHeight],
  );
  if (rows.length < 2 || Number(rows[0].height) !== currentHeight) return null;
  for (let i = 0; i < rows.length; i++) {
    if (supplyZat(rows[i].height) !== currentHeight - i || supplyZat(rows[i].timestamp) === null) return null;
  }
  const first = rows[rows.length - 1];
  const elapsed = Number(rows[0].timestamp) - Number(first.timestamp);
  if (elapsed <= 0) return null;
  return {
    intervalSeconds: elapsed / (rows.length - 1),
    startHeight: Number(first.height),
    endHeight: currentHeight,
    intervals: rows.length - 1,
    source: 'indexed-block-timestamps',
  };
}

module.exports = { ZAT_PER_ZEC, supplyZat, subsidyZat, supplyHistory, dailyNetSupplyChanges, observedBlockCadence };
