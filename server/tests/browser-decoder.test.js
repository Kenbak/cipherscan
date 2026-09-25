const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const ts = require('typescript');
const fs = require('node:fs');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/zcash-tx-parser.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: exportsObject, require: id => { assert.equal(id, './config'); return { isTestnet: false }; }, Uint8Array, BigInt });
const { parseZcashTransaction } = exportsObject;
const fixtures = require('./fixtures/browser-transactions.json');
for (const fixture of fixtures) test(`browser decodes historical ${fixture.key} at ${fixture.height}`, () => {
  const decoded = parseZcashTransaction(fixture.hex);
  for (const [key, value] of Object.entries(fixture.expected)) assert.equal(decoded[key], value, key);
});
test('NU7 branch ID preserves v5/v6 structural decoding; historical v4 remains readable', () => {
  // Synthetic branch-byte mutations are structural checks, not valid signed
  // NU7 activation transactions. Replace/supplement with real fixtures later.
  for (const fixture of fixtures.filter(f => f.expected.version >= 5)) {
    const decoded = parseZcashTransaction(fixture.hex.slice(0, 16) + 'd90a1977' + fixture.hex.slice(24));
    assert.equal(decoded.consensusBranchName, 'NU7');
    for (const [key, value] of Object.entries(fixture.expected)) assert.equal(decoded[key], value, key);
  }
  assert.equal(parseZcashTransaction(fixtures[0].hex).version, 4);
});
test('truncated, odd-length, and trailing modern transaction data are rejected', () => {
  for (const fixture of fixtures.filter(f => f.expected.version >= 5)) {
    assert.throws(() => parseZcashTransaction(fixture.hex.slice(0, -2)));
    assert.throws(() => parseZcashTransaction(fixture.hex + '00'));
    assert.throws(() => parseZcashTransaction(fixture.hex + '0'));
  }
});
