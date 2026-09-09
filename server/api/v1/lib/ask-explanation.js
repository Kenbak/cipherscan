'use strict';
const { z } = require('zod');
const { createHash } = require('node:crypto');
const { analysisSchema } = require('../../../../lib/ask/contract');
const { summarizeEvidence, formatValue, snapshotInput } = require('../../../../lib/ask/data');
const { loadEvidence } = require('../../../../lib/ask/sources');
const { buildMeta } = require('./envelope');

const explainRequestSchema = z.object({ spec: analysisSchema, evidenceKey: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const explanationSchema = z.object({
  summary: z.string().min(1).max(700),
  observations: z.array(z.string().min(1).max(500)).min(1).max(2),
  limitation: z.string().min(1).max(500),
}).strict();
const schema = z.toJSONSchema(explanationSchema); delete schema.$schema;
const explanationTask = {
  name: 'explain_analysis', schema, validator: explanationSchema,
  instruction: `Write a concise plain-language explanation of this Zcash mainnet analysis using only the supplied verified facts and methodology. Return a summary, one or two observations, and one limitation. Every numerical value MUST be a supplied {{fact_id}} placeholder. Do not write literal numbers, URLs or markup. Describe only observable changes and comparisons; never infer private payments, ownership, causes, investment advice or guaranteed privacy. Opposing pool balance changes do not prove migration. Do not call snapshots current when the observation date is older. For flow totals, compare returned buckets only and note partial/missing days. Do not imply monotonic trends from endpoint comparisons. If a value is unavailable, say so; never replace it with zero. The supplied directions and values are authoritative. Keep the complete explanation under two hundred words.`,
};

async function loadExplanationEvidence(spec, internalClient, signal) {
  const evidence = await loadEvidence(spec, async source => {
    const result = await internalClient.dispatch('GET', source.legacy, { query: source.query, parentSignal: signal });
    if (!result.ok || result.body?.success === false) throw new Error('Source unavailable');
    // Retrieval is not authoritative source observation/refresh time.
    return { data: result.body, meta: buildMeta({ network: 'mainnet', requestId: 'ask-evidence' }) };
  });
  const summary = summarizeEvidence(evidence, spec, spec.start || '', spec.end || '');
  if (!summary.points.length) throw new Error('No observations');
  const evidenceKey = createHash('sha256').update(snapshotInput(spec, evidence)).digest('hex');
  const facts = { start_date: summary.start, end_date: summary.end, observation_count: String(summary.points.length) };
  const series = summary.totals.map(item => {
    facts[`${item.key}_value`] = `${formatValue(item.value, evidence.unit)}${item.value === null ? '' : ` ${evidence.unit}`}`;
    facts[`${item.key}_change`] = `${formatValue(item.change, evidence.unit, true)}${item.change === null ? '' : ` ${evidence.unit === '%' ? 'percentage points' : evidence.unit}`}`;
    return { label: item.label, value: `{{${item.key}_value}}`, valueExact: item.value, change: `{{${item.key}_change}}`, changeExact: item.change,
      direction: item.change === null ? 'unavailable' : BigInt(item.change) > 0 ? 'increased' : BigInt(item.change) < 0 ? 'decreased' : 'unchanged' };
  });
  const rankings = evidence.dimension === 'chain' ? summary.points.slice(0, 5).map((point, index) => {
    const id = `rank_${String.fromCharCode(97 + index)}`;
    facts[`${id}_chain`] = point.date;
    facts[`${id}_volume`] = `${formatValue(point.values.volume, evidence.unit)} USD`;
    return { chain: `{{${id}_chain}}`, volume: `{{${id}_volume}}` };
  }) : undefined;
  return { evidenceKey, facts, input: { metric: spec.metric, rankings, period: spec.period, units: evidence.unit, integerEncoding: evidence.csvUnit, window: { start: summary.start, end: summary.end }, series, facts, methodology: evidence.note, freshness: 'unknown' } };
}

function renderExplanation(raw, facts) {
  const parsed = explanationSchema.parse(raw);
  function render(text) {
    const remainder = text.replace(/\{\{([a-z_]+)\}\}/g, (_, id) => {
      if (!Object.hasOwn(facts, id)) throw new Error('Unknown evidence reference');
      return '';
    });
    if (/[0-9{}<>]|https?:|www\./i.test(remainder)) throw new Error('Unvalidated numerical claim or markup');
    return text.replace(/\{\{([a-z_]+)\}\}/g, (_, id) => facts[id]);
  }
  return { summary: render(parsed.summary), observations: parsed.observations.map(render), limitation: render(parsed.limitation) };
}

module.exports = { explainRequestSchema, explanationTask, loadExplanationEvidence, renderExplanation };
