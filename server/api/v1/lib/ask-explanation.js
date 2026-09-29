'use strict';
const { z } = require('zod');
const { createHash } = require('node:crypto');
const { analysisSchema } = require('../../../../lib/ask/contract');
const { summarizeEvidence, formatValue, snapshotInput } = require('../../../../lib/ask/data');
const { loadEvidence } = require('../../../../lib/ask/sources');
const { buildMeta } = require('./envelope');
const { buildInsights, analysisGuidance } = require('./ask-insights');

const explainRequestSchema = z.object({ spec: analysisSchema, evidenceKey: z.string().regex(/^[a-f0-9]{64}$/), challenge: z.string().max(2048).optional() }).strict();
const explanationSchema = z.object({
  summary: z.string().min(1).max(700),
  observations: z.array(z.string().min(1).max(500)).max(2),
  limitation: z.string().max(500),
}).strict();
const schema = z.toJSONSchema(explanationSchema); delete schema.$schema;
const explanationTask = {
  name: 'explain_analysis', schema, validator: explanationSchema,
  instruction: `Write a concise, useful explanation of this Zcash mainnet analysis using only verified facts and methodology. Return a summary, up to two observations, and a limitation only when useful (otherwise empty). Every numerical value and date MUST be an exact supplied {{fact_id}} placeholder; facts already include units. No literal digits, URLs, markup or invented placeholders. Keep under two hundred words. ${analysisGuidance}`,
};

function evidenceProse(facts) {
  const ids = Object.keys(facts);
  if (ids.some(id => !/^[a-z_]+$/.test(id))) throw new Error('Invalid server fact ID');
  // Provider regex compilation rejects Unicode property escapes. The final
  // renderer still rejects all Unicode numeric categories, not only these.
  const digits = '0-9\u0660-\u0669\u06f0-\u06f9\uff10-\uff19';
  const pattern = ids.length ? `^(?:\\{\\{(?:${ids.join('|')})\\}\\}|[^${digits}{}<>])*$` : `^[^${digits}{}<>]*$`;
  return z.string().regex(new RegExp(pattern, 'u'));
}

function explanationTaskFor(facts) {
  const prose = evidenceProse(facts);
  const validator = z.object({ summary: prose.min(1).max(700), observations: z.array(prose.min(1).max(500)).max(2), limitation: prose.max(500) }).strict();
  const schema = z.toJSONSchema(validator); delete schema.$schema;
  return { ...explanationTask, schema, validator };
}

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
  const insights = buildInsights(evidence, spec, summary);
  Object.assign(facts, insights.facts);
  return { evidenceKey, facts, dataContext: { start: summary.start, end: summary.end, retrievedAt: evidence.receivedAt, source: evidence.source, label: evidence.sourceLabel }, input: { metric: spec.metric, pool: spec.pool, rankings, period: spec.period, units: evidence.unit, integerEncoding: evidence.csvUnit, window: { start: summary.start, end: summary.end }, series, analysis: insights.analysis, facts, methodology: evidence.note, coverage: { observedThrough: '{{end_date}}', meaning: 'Latest returned observation date, not a verified indexer refresh time. Describe this date when recency matters; do not invent a freshness status.' } } };
}

function renderExplanation(raw, facts) {
  const parsed = explanationSchema.parse(raw);
  function render(text) {
    const remainder = text.replace(/\{\{([a-z_]+)\}\}/g, (_, id) => {
      if (!Object.hasOwn(facts, id)) throw new Error('Unknown evidence reference');
      return '';
    });
    if (/[\p{N}{}<>]|https?:|www\./iu.test(remainder)) throw new Error('Unvalidated numerical claim or markup');
    return text.replace(/\{\{([a-z_]+)\}\}/g, (_, id) => facts[id]);
  }
  return { summary: render(parsed.summary), observations: parsed.observations.map(render), limitation: render(parsed.limitation) };
}

module.exports = { explainRequestSchema, explanationTask, explanationTaskFor, evidenceProse, loadExplanationEvidence, renderExplanation };
