const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '../..');
const exists = (relativePath) => fs.existsSync(path.join(repositoryRoot, relativePath));
const source = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

// A loading boundary commits the response to 200 before nested layouts run, so
// notFound() below it can only emit a noindex tag instead of a real 404.
test('no loading boundary sits above the detail-route existence checks', () => {
  for (const file of ['app/loading.tsx', 'app/loading.js', 'app/loading.jsx']) {
    assert.equal(exists(file), false, `${file} would stream a 200 before tx/address/block layouts decide 404`);
  }
});

test('detail layouts call notFound() before their own loading boundary', () => {
  for (const layout of ['app/tx/[txid]/layout.tsx', 'app/address/[address]/layout.tsx', 'app/block/[height]/layout.tsx']) {
    const code = source(layout);
    const defaultExport = code.slice(code.indexOf('export default'));
    assert.match(defaultExport, /notFound\(\)/, `${layout} default export must decide missing resources`);
  }
});

test('block pages take their CDN lifetime from ISR tiering, not a blanket proxy header', () => {
  const proxy = source('proxy.ts');
  assert.doesNotMatch(proxy, /CDN-Cache-Control/);
  assert.match(source('lib/seo.ts'), /revalidateSeconds = 3600/);
});

test('legacy /txs/shielded is a permanent config redirect, not a streamed page', () => {
  assert.equal(exists('app/txs/shielded/page.tsx'), false);
  assert.match(source('next.config.ts'), /source: '\/txs\/shielded',\s*destination: '\/txs\?type=shielded',\s*permanent: true/);
});
