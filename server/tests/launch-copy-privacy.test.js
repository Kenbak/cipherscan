const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { pulseEventDescription, NEUTRAL_DESCRIPTIONS } = require('../../lib/pulse-copy');

test('legacy and newly generated Pulse events use neutral metric descriptions', () => {
  for (const [metric, directions] of Object.entries(NEUTRAL_DESCRIPTIONS)) {
    for (const [direction, description] of Object.entries(directions)) {
      assert.equal(pulseEventDescription(metric, direction, 'old interpretation from stored event'), description);
      assert.doesNotMatch(description, /valuation|sell pressure/);
    }
  }
  assert.equal(pulseEventDescription('daily_fees_zat', 'up', 'Fee market surge'), 'Fee market surge');
  assert.equal(pulseEventDescription('toString', 'up', 'Unknown observation'), 'Unknown observation');
});

function loadTS(file) {
  const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  new Function('module', 'exports', result.outputText)(module, module.exports);
  return module.exports;
}
const { analyticsPageUrl } = loadTS('lib/analytics-privacy.ts');
test('analytics excludes sensitive tools, identifiers and unknown routes', () => {
  for (const path of ['/address/u1secret', '/tx/private-hash', '/block/123', '/ask', '/decrypt', '/tools/decode', '/search', '/unknown-secret', '/pools/secret']) {
    assert.equal(analyticsPageUrl(`https://zecblock.com${path}`), null, path);
  }
  assert.equal(analyticsPageUrl('not a url'), null);
  assert.equal(analyticsPageUrl('file:///pools'), null);
});
test('analytics allows only sanitized landing page URLs', () => {
  assert.equal(analyticsPageUrl('https://zecblock.com/pools?address=secret#viewing-key'), 'https://zecblock.com/pools');
  assert.equal(analyticsPageUrl('https://zecblock.com/?q=secret'), 'https://zecblock.com/');
});
test('font guard covers CSS shorthand, decimal px and rem declarations', async () => {
  const { undersizedCssFonts } = await import('../../scripts/typography-rules.mjs');
  for (const css of ['font-size: 11px;', 'font: 500 10.5px/1.4 monospace;', 'font-size: .6875rem;']) assert.equal(undersizedCssFonts(css).length, 1);
  for (const css of ['font-size: var(--text-caption);', 'font: 500 12px/1.4 monospace;', 'font-size: .75rem;']) assert.equal(undersizedCssFonts(css).length, 0);
});

test('launch-facing identity stays consistent in assets, metadata and contact links', () => {
  const press = fs.readFileSync('app/press/page.tsx', 'utf8');
  assert.match(press, /Geist Sans/);
  assert.match(press, /Geist Mono/);
  assert.match(press, /#F8BC21/);
  assert.doesNotMatch(press, /#F4B728|terminal dot|Inter —|JetBrains Mono/);
  assert.match(fs.readFileSync('public/brand/zecblock-mark.svg', 'utf8'), /<rect[^>]*fill="#F8BC21"/);
  for (const file of ['app/layout.tsx','components/Footer.tsx','app/about/page.tsx','app/press/page.tsx','app/privacy-policy/page.tsx','app/terms/page.tsx']) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /https:\/\/x\.com\/zecblock/, file);
    assert.doesNotMatch(source, /(?:twitter|x)\.com\/cipherscan_app/, file);
  }
});
