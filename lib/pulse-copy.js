'use strict';

// Shared by generation, API reads and the UI: old stored alerts must use the
// same observational wording as newly generated alerts.
const NEUTRAL_DESCRIPTIONS = {
  mvrv: { up: 'MVRV ratio spike', down: 'MVRV ratio drop' },
  miner_exchange_ratio: { up: 'Miner-to-exchange transfer share spike', down: 'Miner-to-exchange transfer share decline' },
};
function pulseEventDescription(metric, direction, fallback) {
  return Object.hasOwn(NEUTRAL_DESCRIPTIONS, metric) && (direction === 'up' || direction === 'down')
    ? NEUTRAL_DESCRIPTIONS[metric][direction] || fallback
    : fallback;
}
module.exports = { NEUTRAL_DESCRIPTIONS, pulseEventDescription };
