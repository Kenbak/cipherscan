'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { addDays, day, HISTORY_START } = require('../lib/transaction-activity');
const { completedWeekEnd, weeklySeries, summarize, makeDraft, renderChart } = require('../lib/activity-milestones');
const { computeZscore } = require('../jobs/detect-anomalies');

test('UTC dates and weekly cutoff are independent of local timezone and DST', () => {
  assert.equal(addDays('2026-03-29', 1), '2026-03-30');
  assert.throws(() => day('2026-02-30'));
  assert.equal(completedWeekEnd(new Date('2026-09-21T01:59:59Z')), '2026-09-14');
  assert.equal(completedWeekEnd(new Date('2026-09-21T02:00:00Z')), '2026-09-21');
  assert.equal(completedWeekEnd(new Date('2026-09-27T23:00:00Z')), '2026-09-21');
});

test('ranking reproduces the incident, ties are explicit and zero baseline has no percentage', () => {
  const weeks = [
    { week: '2022-06-20', shielded: 135389 }, { week: '2022-06-27', shielded: 80732 },
    { week: '2022-08-01', shielded: 64795 }, { week: '2026-09-07', shielded: 28227 },
    { week: '2026-09-14', shielded: 62379 },
  ];
  const result = summarize(weeks, 'shielded');
  assert.equal(result.rank, 4); assert.equal(result.lastAtLeast, '2022-08-01');
  assert.equal(Math.round(result.changePct), 121); assert.equal(result.tied, false);
  weeks.at(-2).shielded = 62379;
  assert.equal(summarize(weeks, 'shielded').tied, true);
  assert.equal(summarize(weeks, 'shielded').lastAtLeast, '2026-09-07');
  weeks.at(-2).shielded = 0;
  assert.equal(summarize(weeks, 'shielded').changePct, null);
});

test('draft retains complete chart, exact evidence and distinguishes the two counts', () => {
  const days = Array.from({ length: 53 * 7 }, (_, i) => ({ date: addDays(HISTORY_START, i), shielded: i < 52 * 7 ? 10 : 1000, fully_shielded: i < 52 * 7 ? 2 : 500 }));
  const end = addDays(HISTORY_START, days.length);
  const draft = makeDraft({ days, capturedAt: '2026-09-23T00:00:00Z', tip: { height: 1, hash: 'abc' } }, end);
  assert.equal(draft.metadata.metrics[0].value, 7000);
  assert.equal(draft.metadata.metrics[1].value, 3500);
  assert.equal(draft.metadata.chart.length, 53);
  assert.equal(draft.metadata.metrics[0].rank, 1);
  assert.ok(draft.content.length <= 280);
  assert.match(draft.metadata.methodology, /coinbase excluded/);
  assert.match(draft.metadata.methodology, /includes pool migrations/);
  assert.match(renderChart(draft.metadata), /DRAFT/);
  assert.throws(() => weeklySeries(days.filter((_, i) => i !== 30), end), /Missing day/);
  assert.throws(() => weeklySeries(days.slice(1), end), /coverage/);
  days.at(-1).shielded = NaN;
  assert.throws(() => weeklySeries(days, end), /Invalid historical/);
});

test('ordinary weeks do not become milestone drafts', () => {
  const days = Array.from({ length: 54 * 7 }, (_, i) => ({ date: addDays(HISTORY_START, i), shielded: 10, fully_shielded: 2 }));
  assert.equal(makeDraft({ days }, addDays(HISTORY_START, days.length)), null);
});

test('z-score compares the target with prior observations without diluting the spike', () => {
  const baseline = Array.from({ length: 14 }, (_, i) => i % 2 ? 11 : 9);
  assert.equal(computeZscore([...baseline, 20]).zscore, 10);
  assert.equal(computeZscore([...baseline.slice(1), 20]), null);
  assert.equal(computeZscore([...Array(14).fill(10), 20]), null);
});
