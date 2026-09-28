'use strict';

// These prompts interpret the current recipe; selecting one never changes it.
// Shared by the widget and server so a classifier cannot silently drop filters.
function analysisFollowUps(spec) {
  if (!spec) return [];
  if (spec.metric === 'balances') return ['Where is the selected pool balance most concentrated?', 'How has the recent weekly pace changed?'];
  if (spec.metric === 'migration_share') return ['How quickly has Ironwood’s share changed?', 'How has the recent weekly pace changed?'];
  if (spec.metric.startsWith('chain_')) return ['How concentrated is volume in the leading chain?', 'Which chains contribute the most tracked volume in this direction?'];
  return [spec.metric === 'flows' || spec.metric === 'swap_volume' ? 'How concentrated was volume on the busiest day?' : 'How concentrated was activity on the busiest day?', 'How does the latest week compare with the previous week?'];
}

module.exports = { analysisFollowUps };
