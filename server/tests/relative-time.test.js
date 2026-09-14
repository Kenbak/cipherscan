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
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: name => dependencies[name] ?? require(name) });
  return exports;
}

const utils = load('lib/utils.ts');
const { RelativeTime, RelativeTimeProvider } = load('components/RelativeTime.tsx', {
  '@/lib/utils': utils,
});
const timestamp = 1_789_367_400;
const render = (value, initialNow) => renderToStaticMarkup(
  React.createElement(RelativeTimeProvider, { initialNow }, React.createElement(RelativeTime, { timestamp: value })),
);

test('server ages use the supplied clock, including exact minute and hour boundaries', () => {
  for (const [seconds, expected] of [[59, 'Just now'], [60, '1 min ago'], [120, '2 mins ago'], [3600, '1 hour ago']]) {
    assert.equal(utils.formatRelativeTime(timestamp, (timestamp + seconds) * 1000), expected);
  }
});

test('server HTML contains relative age and an exact machine-readable date and UTC tooltip', () => {
  const html = render(timestamp, (timestamp + 120) * 1000);
  assert.match(html, />2 mins ago<\/time>/);
  assert.ok(html.includes(`dateTime="${new Date(timestamp * 1000).toISOString()}"`));
  assert.match(html, /title="[^"]+ UTC"/);
});

test('invalid timestamps remain unavailable, never a fake age', () => {
  for (const value of [NaN, Infinity, 0, -1]) {
    assert.equal(render(value, timestamp * 1000), '<time title="Time unavailable">Time unavailable</time>');
  }
});

test('callers without a server clock retain a deterministic UTC server fallback', () => {
  const html = renderToStaticMarkup(React.createElement(RelativeTime, { timestamp }));
  assert.match(html, />[^<]+ UTC<\/time>/);
});
