'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const braces = require('braces');

test('Next lint micromatch resolves to the reviewed patched source', () => {
  const next = createRequire(require.resolve('@next/eslint-plugin-next'));
  const glob = createRequire(next.resolve('fast-glob'));
  const match = createRequire(glob.resolve('micromatch'));
  assert.equal(fs.realpathSync(match.resolve('braces')), path.resolve('vendor/braces/index.js'));
});

test('normal brace and range expansion remains compatible', () => {
  assert.deepEqual(braces.expand('{a,b}'), ['a', 'b']);
  assert.deepEqual(braces.expand('file{01..03}.txt'), ['file01.txt', 'file02.txt', 'file03.txt']);
  assert.doesNotThrow(() => braces('{'.repeat(100) + 'a,b' + '}'.repeat(100)));
});

test('deep strings and direct ASTs fail with explicit depth limits instead of stack exhaustion', () => {
  for (const fn of [braces, braces.parse, braces.compile, braces.expand]) {
    assert.throws(() => fn('{'.repeat(3500) + 'a,b' + '}'.repeat(3500)), /exceeds max depth/);
    assert.throws(() => fn('('.repeat(3500) + ')'.repeat(3500)), /exceeds max depth/);
  }
  let ast = { type: 'text', value: 'a' };
  for (let i = 0; i < 101; i++) ast = { type: 'brace', nodes: [ast] };
  ast = { type: 'root', nodes: [ast] };
  for (const fn of [braces.compile, braces.expand, braces.stringify]) {
    assert.throws(() => fn(structuredClone(ast)), /exceeds max depth/);
  }
  assert.throws(() => braces('{{a,b},c}', { maxDepth: 1 }), /exceeds max depth/);
  assert.throws(() => braces('{'.repeat(101) + 'a,b' + '}'.repeat(101), { maxDepth: Infinity }), /exceeds max depth/);
});
