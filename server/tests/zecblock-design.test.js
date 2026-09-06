const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '../..');

function load(file, imports = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => name in imports ? imports[name] : require(name), module, module.exports);
  return module.exports;
}

const { getChartColors } = load('lib/chart-theme.ts');
const { SupplyVerification } = load('app/ironwood/components/SupplyVerification.tsx', {
  '@/components/ShareableCard': { ShareableCard: ({ children }) => React.createElement('section', null, children) },
  '@/hooks/useCurrencyToggle': { fmtValue: (v) => String(v) },
  './PoolBalanceRow': { PoolBalanceRow: () => null },
});

function renderVerification(pct) {
  return renderToStaticMarkup(React.createElement(SupplyVerification, {
    overview: { supplyAudit: {}, poolSizes: { chainSupplyZat: 1000, transparentZat: 600, sproutZat: 0, saplingZat: 0, orchardZat: 27, ironwoodZat: 373, sourceHeight: 1, isLive: false }, supplyVerification: pct === null ? null : { chainSupplyZat: 1000, verifiedPct: pct } },
    colors: getChartColors('dark'),
  }));
}

test('supply verification preserves a 2.7% pending fraction instead of inflating it to 5%', () => {
  const html = renderVerification(97.3);
  const widths = [...html.matchAll(/width:([\d.]+)%/g)].map(m => Number(m[1]));
  assert.equal(widths.length, 2);
  assert.equal(widths[0], 97.3);
  assert.ok(Math.abs(widths[1] - 2.7) < 1e-9);
  assert.ok(html.includes('Pending'));
});

test('zero and complete verification retain exact endpoints', () => {
  for (const pct of [0, 100]) {
    const html = renderVerification(pct);
    assert.ok(html.includes(`width:${pct}%`));
    assert.ok(html.includes(`width:${100-pct}%`));
  }
});

test('unavailable or invalid verification draws no fabricated proportion', () => {
  for (const pct of [null, -1, 101, NaN]) {
    const html = renderVerification(pct);
    assert.ok(html.includes('Supply verification unavailable'));
    assert.ok(!html.includes('role="img"'));
  }
});

test('metadata uses the new mainnet identity and preserves network indexation boundaries', () => {
  for (const network of ['mainnet', 'testnet', 'crosslink-testnet']) {
    const seo = load('lib/seo.ts', {
      '@/lib/network': { getConfiguredNetwork: () => network },
      '@/lib/api-config': { getApiUrlForNetwork: () => '' },
      '@/lib/server-fetch': {},
    });
    const meta = seo.buildPageMetadata({ title: 'Zcash Shielded Pools | ZecBlock', description: 'Pool balances', path: '/pools' });
    assert.equal(meta.robots.index, network === 'mainnet');
    assert.equal(meta.robots.follow, true);
    assert.equal(meta.openGraph.siteName, 'ZecBlock');
    assert.equal(meta.openGraph.images[0].width, 1200);
    assert.ok(meta.openGraph.images[0].url.endsWith('/opengraph-image'));
    assert.equal(meta.alternates.canonical, network === 'mainnet' ? 'https://zecblock.com/pools' : network === 'testnet' ? 'https://testnet.cipherscan.app/pools' : 'https://crosslink.cipherscan.app/pools');
    const home = seo.buildPageMetadata({ title: 'Explorer | ZecBlock', description: 'Search', path: '/', indexOnTestnet: true });
    assert.equal(home.robots.index, network !== 'crosslink-testnet');
  }
});

const { summarizeMempool } = load('lib/mempool-summary.ts');

test('mempool composition separates fully shielded count from inclusive pool share', () => {
  const rows = [{ type: 'shielded' }, { type: 'mixed' }, { type: 'mixed' }, { type: 'transparent' }];
  assert.deepEqual(summarizeMempool(rows), { shielded: 1, mixed: 2, transparent: 1, shown: 4, shieldedShare: 75 });
  // Recomputed from the current list after a stream removal, rather than stale poll stats.
  assert.equal(summarizeMempool(rows.slice(1)).shieldedShare, 67);
  assert.equal(summarizeMempool([]).shieldedShare, null);
  assert.equal(summarizeMempool([{ type: 'transparent' }]).shieldedShare, 0);
});
