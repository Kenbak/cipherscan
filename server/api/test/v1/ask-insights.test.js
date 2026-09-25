'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildInsights } = require('../../v1/lib/ask-insights');
const { summarizeEvidence } = require('../../../../lib/ask/data');
const { loadExplanationEvidence, explanationTaskFor, renderExplanation } = require('../../v1/lib/ask-explanation');
const { answerTaskFor, chat } = require('../../v1/lib/ask-chat');
const { interpret } = require('../../v1/routes/ask');
const { maximumCost } = require('../../v1/lib/ask-budget');
const spec = { version: 1, metric: 'balances', pool: 'all', period: '90d', view: 'line', start: null, end: null };
const day = index => new Date(Date.UTC(2026, 7, 1 + index)).toISOString().slice(0, 10);
const zat = value => (BigInt(value) * 100000000n).toString();
function sample(metric = 'balances', count = 15) {
  const keys = metric === 'balances' ? ['ironwood', 'orchard'] : ['shield', 'deshield'];
  return { unit: 'ZEC', series: keys.map(key => ({ key, label: key })), points: Array.from({ length: count }, (_, i) => ({ date: day(i), values: Object.fromEntries(keys.map((key, k) => [key, zat(k ? 1000 - i * 50 : i * 80)])) })) };
}
const analyze = (evidence, metric = 'balances') => buildInsights(evidence, { ...spec, metric }, summarizeEvidence(evidence, { ...spec, metric }));

test('pool comparison derives exact combined growth, shares and observed timing', () => {
  const { facts, analysis } = analyze(sample());
  assert.equal(facts.combined_movement, '420.00 ZEC');
  assert.equal(facts.combined_relative_change, '42.00 %');
  assert.equal(facts.ironwood_end_share, '78.87 %');
  assert.equal(facts.ironwood_start_share, '0.00 %');
  assert.equal(analysis.series[0].relativeChange, null); // Undefined growth from zero.
  assert.equal(facts.ironwood_first_lead_date, '2026-08-09');
  assert.equal(facts.ironwood_strongest_start, '2026-08-01');
  assert.equal(facts.ironwood_strongest_end, '2026-08-08');
  assert.equal(facts.ironwood_strongest_movement, '560.00 ZEC');
  assert.equal(facts.ironwood_recent_value, '560.00 ZEC');
  assert.equal(facts.ironwood_previous_value, '560.00 ZEC');
  assert.equal(analysis.series[0].recentComparison.pattern, 'same positive pace');
  assert.match(analysis.comparison.denominator, /not all shielded/);
});

test('missing observations never create daily windows or a false exact crossover', () => {
  const evidence = sample();
  evidence.points.splice(7, 1);
  evidence.points[1].values.ironwood = null;
  const { facts, analysis } = analyze(evidence);
  assert.equal(facts.missing_dates, '1');
  assert.equal(facts.ironwood_missing, '1');
  assert.equal(analysis.coverage.completeDates, false);
  assert.equal(analysis.series[0].recentComparison, undefined);
  assert.equal(analysis.series[0].strongestWeek, undefined);
  assert.match(analysis.comparison.firstObservedIronwoodLead.scope, /missing observations can hide/);
  assert.equal(facts.combined_movement, '420.00 ZEC'); // Valid endpoints still compare.
});

test('unknown endpoints, zero denominators and single snapshots do not invent comparisons', () => {
  const evidence = sample();
  evidence.points[0].values.orchard = null;
  assert.equal(analyze(evidence).analysis.comparison, null);
  for (const point of evidence.points) point.values = { ironwood: '0', orchard: '0' };
  const zero = analyze(evidence);
  assert.equal(zero.analysis.comparison.ironwoodEndShare, null);
  assert.equal(zero.analysis.comparison.combinedRelativeChange, null);
  assert.equal(zero.analysis.comparison.firstObservedIronwoodLead, undefined);
  assert.equal(zero.analysis.series[0].strongestWeek, undefined);
  assert.equal(analyze(sample('balances', 1)).analysis.comparison, null);
});

test('negative stock changes keep their direction, and already-leading pools get no invented crossover', () => {
  const evidence = sample();
  for (const [i, point] of evidence.points.entries()) point.values = { ironwood: zat(2000 - i * 80), orchard: zat(100) };
  const { facts, analysis } = analyze(evidence);
  assert.equal(analysis.series[0].direction, 'decreased');
  assert.equal(facts.ironwood_movement, '1,120.00 ZEC');
  assert.equal(facts.ironwood_relative_change, '56.00 %');
  assert.equal(analysis.series[0].recentComparison.recent.direction, 'decreased');
  assert.doesNotMatch(analysis.series[0].recentComparison.pattern, /growth accelerated/);
  assert.equal(analysis.comparison.firstObservedIronwoodLead, undefined);
});

test('percentages and changes preserve integer precision beyond JavaScript safe numbers', () => {
  const evidence = sample('balances', 2);
  evidence.points[0].values = { ironwood: '90071992547409930000', orchard: '90071992547409930000' };
  evidence.points[1].values = { ironwood: '90071992547410930000', orchard: '90071992547409930000' };
  const { facts } = analyze(evidence);
  assert.equal(facts.combined_movement, '0.01 ZEC');
  assert.equal(facts.ironwood_start_share, '50.00 %');
});

test('flow explanations compare bucket totals, peak concentration and public direction imbalance', () => {
  const evidence = sample('flows');
  const { facts, analysis } = analyze(evidence, 'flows');
  assert.equal(facts.shield_recent_value, '6,160.00 ZEC'); // Days 8 through 14 inclusive.
  assert.equal(facts.shield_previous_value, '2,240.00 ZEC'); // Days 1 through 7.
  assert.equal(facts.shield_peak_share, '13.33 %');
  assert.equal(analysis.series[0].recentComparison.pattern, 'higher recent total');
  assert.equal(analysis.series[0].strongestWeek, undefined);
  assert.equal(analysis.comparison.larger, 'deshield');
  evidence.points[4].values.shield = null;
  const missing = analyze(evidence, 'flows');
  assert.equal(missing.analysis.comparison, null);
  assert.equal(missing.analysis.series[0].peak.shareOfReturnedTotal, undefined);
});

test('migration-share changes use percentage points and rankings use only complete known denominators', () => {
  const evidence = { unit: '%', series: [{ key: 'share', label: 'Ironwood share' }], points: [{ date: day(0), values: { share: '1000' } }, { date: day(1), values: { share: '4000' } }] };
  assert.equal(analyze(evidence, 'migration_share').facts.share_movement, '30.00 percentage points');
  const ranking = { dimension: 'chain', unit: 'USD', series: [{ key: 'volume', label: 'Into ZEC' }], points: [{ date: 'btc', values: { volume: '300' } }, { date: 'eth', values: { volume: '100' } }] };
  assert.equal(analyze(ranking, 'chain_inflows').facts.leading_chain_share, '75.00 %');
  ranking.points[1].values.volume = null;
  assert.equal(analyze(ranking, 'chain_inflows').analysis.ranking, null);
});

test('server evidence limits insights to the selected date range and pool', async () => {
  const source = { dispatch: async () => ({ ok: true, body: { points: sample().points.map(point => ({ date: point.date, ironwoodZat: point.values.ironwood, orchardZat: point.values.orchard, hasPoolBreakdown: true })) } }) };
  const evidence = await loadExplanationEvidence({ ...spec, pool: 'orchard', start: day(7) }, source, AbortSignal.timeout(1000));
  assert.equal(evidence.input.analysis.comparison, null);
  assert.equal(evidence.input.analysis.series.length, 1);
  assert.equal(evidence.facts.orchard_start, '650.00 ZEC');
  assert.equal(evidence.facts.orchard_movement, '350.00 ZEC');
  assert.equal(evidence.facts.calendar_days, '8');
  assert.equal(evidence.input.analysis.series[0].recentComparison, undefined);
});

test('enriched evidence stays within provider request budget and both narrative paths retain provenance', async () => {
  const rows = Array.from({ length: 366 }, (_, i) => ({ date: day(i), ironwoodZat: zat(i), orchardZat: zat(2000 - i), saplingZat: zat(1000 - i), sproutZat: zat(500), hasPoolBreakdown: true }));
  const source = { dispatch: async () => ({ ok: true, body: { points: rows } }) };
  const evidence = await loadExplanationEvidence({ ...spec, period: '1y' }, source, AbortSignal.timeout(1000));
  const prose = { summary: 'Their combined balance was {{combined_balance}}.', observations: ['Ironwood held {{ironwood_end_share}} of that pair.'], limitation: '' };
  const tasks = [explanationTaskFor(evidence.facts), answerTaskFor(evidence.facts, [{ id: 'pools' }])];
  for (const task of tasks) {
    const answer = task.name === 'contextual_answer' ? { ...prose, sources: ['pools'] } : prose;
    assert.equal(task.validator.safeParse(answer).success, true);
    assert.equal(task.validator.safeParse({ ...answer, summary: 'Invented 42%.' }).success, false);
    await interpret({ provider: 'openai', model: 'fixture' }, { evidence: evidence.input }, AbortSignal.timeout(1000), async (url, init) => {
      assert.ok(Buffer.byteLength(init.body) < 48000);
      assert.ok(maximumCost({ inputRate: 0.125, outputRate: 0.5 }, init.body) > 0);
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(answer) } }] });
    }, task);
  }
  assert.match(renderExplanation(prose, evidence.facts).summary, /2,000.00 ZEC/);
  assert.equal(renderExplanation(prose, evidence.facts).limitation, '');
  let calls = 0;
  const result = await chat({ question: 'Compare Orchard and Ironwood', page: 'ask', context: null, history: [], locale: 'en' }, async (body, task) => {
    if (++calls === 1) return { intent: 'analysis', spec, topics: ['pools'], locale: 'en' };
    assert.ok(body.evidence.analysis.comparison);
    assert.match(task.instruction, /strongest relevant finding/);
    return task.validator.parse({ ...prose, sources: ['pools'] });
  }, source, AbortSignal.timeout(1000), '');
  assert.equal(calls, 2);
  assert.match(result.answer, /combined balance/);
});
