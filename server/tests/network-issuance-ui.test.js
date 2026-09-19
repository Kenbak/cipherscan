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
  assert.match(html, /future upgrades may change it/);
  assert.doesNotMatch(html, /1,152|0 ZEC|NaN/);
});
