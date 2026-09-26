const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(file, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: name => dependencies[name] ?? require(name) });
  return exports;
}

const cards = load('components/ui/Card.tsx');
const { HalvingPanel } = load('components/network/HalvingPanel.tsx', {
  '@/components/ui/Card': cards,
  '@/lib/format-numbers': load('lib/format-numbers.ts'),
});
const unavailable = {
  halvingStatus: 'unavailable', halvingBlock: null, blocksRemaining: null,
  eraProgress: null, currentSubsidy: 1.5625, nextSubsidy: null,
  minerReward: null, nextMinerReward: null, estimatedDate: null, estimatedSeconds: null,
};

test('server-rendered halving panel explains unknown schedules without guessed progress', () => {
  const html = renderToStaticMarkup(React.createElement(HalvingPanel, { halving: unavailable }));
  assert.match(html, /next halving cannot currently be determined/);
  assert.match(html, /1\.5625 ZEC/);
  assert.doesNotMatch(html, /Current era progress|NaN|Invalid Date/);
});

test('issuance copy describes observed cadence and keeps missing allocations unavailable', () => {
  const { MiningIssuance } = load('components/network/MiningIssuance.tsx', {
    '@/components/ui/Card': cards,
    '@/components/ui/Skeleton': { Skeleton: () => null },
    '@/components/ui/SectionHeader': { SectionHeader: () => null },
    './HalvingPanel': { HalvingPanel },
    '@/hooks/useApiQuery': { useApiQuery: path => ({ data: path.endsWith('/halving')
      ? unavailable : { dailyEmissionEstimate: null }, loading: false, error: null }) },
  });
  const html = renderToStaticMarkup(React.createElement(MiningIssuance));
  assert.match(html, /recent observed block cadence/);
  assert.match(html, /unscheduled upgrades may change it/);
  assert.doesNotMatch(html, /1,152|0 ZEC|NaN/);
});

function renderAccounting(feeRule, nsmBalanceZat) {
  const { NetworkAccounting } = load('components/network/NetworkAccounting.tsx', {
    'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
    '@/components/ui/Card': cards,
    '@/components/ui/SectionHeader': { SectionHeader: () => null },
    '@/lib/config': { CURRENCY: 'ZEC' },
    '@/hooks/useApiQuery': { useApiQuery: () => ({ data: {
      nodeHeight: 3497353, nsmBalanceZat,
      block: { height: 3497353, feeRule, feesPaidZat: '362088', feesToNsmZat: '217252',
        minerFeeAllocationZat: '144836', minerSubsidyZat: '125000000',
        minerReceiptsZat: '125144836', reissuanceZat: null },
    }, loading: false, error: null }) },
  });
  return renderToStaticMarkup(React.createElement(NetworkAccounting));
}

test('pre-NU7 accounting shows current earnings without inactive or future NSM fields', () => {
  const html = renderAccounting('pre-NU7', '0');
  assert.match(html, /Transaction fees paid/);
  assert.match(html, /Miner subsidy allocation/);
  assert.match(html, /Actual miner receipts/);
  assert.match(html, /0\.00362088 ZEC/);
  assert.doesNotMatch(html, /NSM|NU7|Reissuance|Minimum fee removal|details/);
});

test('active accounting preserves signed NSM data without inventing unavailable reissuance', () => {
  const html = renderAccounting('floor(aggregate-block-fees * 3 / 5)', '-9223372036854775808');
  assert.match(html, /NSM balance/);
  assert.match(html, /-92,233,720,368\.54775808 ZEC/);
  assert.match(html, /0\.00217252 ZEC/);
  assert.doesNotMatch(html, /Reissuance|60%|NU7/);
  const missing = renderAccounting('floor(aggregate-block-fees * 3 / 5)', null);
  assert.match(missing, /NSM balance<\/dt><dd[^>]*>Unavailable/);
  const unavailable = renderAccounting('unavailable', null);
  assert.doesNotMatch(unavailable, /NSM balance|Minimum fee removal/);
});
