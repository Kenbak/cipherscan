'use strict';
const { targetSeconds, targetSpacing, halvingIndex, halvingHeight } = require('./network-schedule');
const MAX_ZAT = 2100000000000000n;

// Scheduled new issuance only. NSM reissuance and future supply removals are
// state-dependent and cannot be predicted from the subsidy clock.
function issuanceBetween(schedule, start, end) {
  if (!schedule || !Number.isSafeInteger(start) || start < 20000 || !Number.isSafeInteger(end) || end < start) return null;
  let sum = 0n;
  for (let height = start + 1; height <= end;) {
    const index = halvingIndex(schedule, height);
    const spacing = targetSpacing(schedule, height);
    if (index === null || spacing === null) return null;
    const boundary = Math.min(end + 1, halvingHeight(schedule, index + 1) ?? end + 1,
      schedule.eras.find(era => era.height > height)?.height ?? end + 1);
    const subsidy = 1250000000n * BigInt(spacing) / 150n / (2n ** BigInt(index));
    sum += BigInt(boundary - height) * subsidy;
    height = boundary;
  }
  return sum;
}

function supplyProjection({ schedule, latest, currentHeight, cadence }) {
  const start = latest?.height;
  const time = Date.parse(latest?.date);
  const supply = latest?.circulatingZat;
  if (!schedule || !Number.isSafeInteger(start) || start < 20000 || start > currentHeight ||
      !Number.isFinite(time) || !Number.isSafeInteger(supply) || supply <= 0 || BigInt(supply) > MAX_ZAT) return null;
  const index = halvingIndex(schedule, start);
  if (index === null) return null;
  const milestones = Array.from({ length: 4 }, (_, i) => ({ height: halvingHeight(schedule, index + i + 1), halving: index + i + 1 }))
    .filter(m => m.height !== null);
  const end = milestones.at(-1)?.height;
  if (!end) return null;
  const heights = new Set([start, ...milestones.map(m => m.height),
    ...schedule.eras.filter(e => e.height > start && e.height <= end).map(e => e.height)]);
  for (let i = 1; i < 160; i++) heights.add(Math.floor(start + (end - start) * i / 160));
  const observedCadence = Number.isFinite(cadence?.intervalSeconds) && cadence.intervalSeconds > 0;
  const ratio = observedCadence ? cadence.intervalSeconds / targetSpacing(schedule, currentHeight) : 1;
  const points = [...heights].sort((a, b) => a - b).map(height => {
    const issued = issuanceBetween(schedule, start, height);
    const total = issued === null ? null : BigInt(supply) + issued;
    return { height, date: new Date(time + targetSeconds(schedule, start, height) * ratio * 1000).toISOString(),
      circulating: total !== null && total <= MAX_ZAT ? Number(total) / 1e8 : null,
      circulatingZat: total !== null && total <= MAX_ZAT ? total.toString() : null,
      halving: milestones.find(m => m.height === height)?.halving ?? null };
  });
  return { method: 'observed-supply-plus-scheduled-subsidy', dateBasis: observedCadence ? 'observed-cadence' : 'consensus-target-spacing', excludes: ['future-supply-removals', 'nsm-reissuance'], points };
}
module.exports = { issuanceBetween, supplyProjection };
