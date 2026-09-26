const { targetSpacing } = require('./network-schedule');

function cadencePoints(rows, schedule, since, window = 120) {
  const history = [...rows].sort((a, b) => Number(a.height) - Number(b.height));
  const points = [];
  let consecutive = 0;
  for (let i = 0; i < history.length; i++) {
    const row = history[i]; const previous = history[i - 1];
    const height = Number(row.height); const timestamp = Number(row.timestamp);
    const valid = Number.isSafeInteger(height) && Number.isSafeInteger(timestamp);
    const adjacent = valid && previous && Number(previous.height) === height - 1 && Number.isSafeInteger(Number(previous.timestamp));
    consecutive = adjacent ? consecutive + 1 : 0;
    if (!valid || timestamp < since) continue;
    const count = Math.min(window, consecutive);
    const elapsed = count ? timestamp - Number(history[i - count].timestamp) : null;
    points.push({ height, timestamp, intervalSeconds: adjacent ? timestamp - Number(previous.timestamp) : null,
      averageSeconds: count === window && elapsed > 0 ? elapsed / count : null,
      targetSeconds: targetSpacing(schedule, height), intervals: count });
  }
  return points;
}

module.exports = { cadencePoints };
