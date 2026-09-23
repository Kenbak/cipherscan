const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

test('UTC activity dates keep their label and chart key in every viewer timezone', () => {
  const script = `const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
    const target={exports:{}};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/privacy-trend-dates.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,target);
    console.log(JSON.stringify(['2026-09-14','2026-09-14T00:00:00.000Z','2026-03-29'].map(date=>[target.exports.normalizeTrendDateKey(date),target.exports.formatTrendDate(date)])));`;
  for (const TZ of ['Asia/Tokyo', 'America/Los_Angeles', 'Europe/Berlin', 'UTC']) {
    const rows = JSON.parse(execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' }));
    assert.deepEqual(rows, [['2026-09-14','Sep 14'],['2026-09-14','Sep 14'],['2026-03-29','Mar 29']], TZ);
  }
});
