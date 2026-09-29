const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies = {}, environment = process) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, { exports, process: environment, require: name => dependencies[name] ?? require(name) });
  return exports;
}

function newsletters(filesystem = fs) {
  return load('lib/newsletter/index.ts', {
    fs: filesystem, './parser': {}, './inline': {}, './tables': {},
  });
}

test('newsletter lookup rejects traversal and encoded separators before filesystem access', () => {
  const fail = () => assert.fail('invalid slug must not touch the filesystem');
  const { getNewsletter } = newsletters({ existsSync: fail, readFileSync: fail });
  for (const slug of ['../../AGENTS', '../README', '/etc/passwd', '..\\README', '%2e%2e%2fAGENTS', 'weekly%2f..', 'a\0b', '.', '', 'a'.repeat(121), null, ['weekly-2026-09-27']]) {
    assert.equal(getNewsletter(slug), null, String(slug));
  }
});

test('every current issue retains its slug and content; unknown safe slugs remain missing', () => {
  const { getAllNewsletters, getNewsletter } = newsletters();
  const issues = getAllNewsletters();
  assert.ok(issues.length > 0);
  assert.equal(issues.length, fs.readdirSync('content/newsletter').filter(f => f.endsWith('.md')).length);
  for (const issue of issues) {
    assert.equal(getNewsletter(issue.slug).content, issue.content);
    assert.equal(getNewsletter(issue.slug).title, issue.title);
  }
  assert.equal(getNewsletter('nonexistent-security-test-issue'), null);
});

test('newsletter discovery excludes filenames that cannot safely identify a route', () => {
  const { getAllNewsletters } = newsletters({
    existsSync: () => true,
    readdirSync: () => ['../private.md', 'bad%2fslug.md', '.hidden.md', 'notes.txt'],
    readFileSync: () => assert.fail('invalid filenames must not be read'),
  });
  assert.equal(getAllNewsletters().length, 0);
});

test('RSS encodes issue paths and escapes XML text and attribute URLs', async () => {
  class Response {
    constructor(body, options) { this.body = body; this.options = options; }
  }
  const { GET } = load('app/newsletter/rss/route.ts', {
    '@/lib/newsletter': { getAllNewsletters: () => [{ slug: 'issue/<tag>&"', title: '<title>', summary: 'A & B', date: '2026-09-27' }] },
    'next/server': { NextResponse: Response },
  }, { env: { NEXT_PUBLIC_SITE_URL: 'https://example.com/a?x=1&y="q"' } });
  const response = await GET();
  assert.match(response.body, /<title>&lt;title&gt;<\/title>/);
  assert.match(response.body, /A &amp; B/);
  assert.match(response.body, /x=1&amp;y=&quot;q&quot;\/newsletter\/rss/);
  assert.match(response.body, /\/newsletter\/issue%2F%3Ctag%3E%26%22/);
  assert.equal(response.body.includes('<tag>'), false);
  assert.equal(response.options.headers['Content-Type'], 'application/xml; charset=utf-8');
});
