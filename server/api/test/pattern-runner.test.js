const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('pattern runner uses the provisioned interpreter, forwards dry-run, and propagates ML failure', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pattern-runner-'));
  try {
    fs.mkdirSync(path.join(root, 'jobs'));
    fs.mkdirSync(path.join(root, 'api'));
    fs.mkdirSync(path.join(root, 'bin'));
    fs.copyFileSync(path.join(__dirname, '../../jobs/run-pattern-scanners.sh'), path.join(root, 'jobs/run.sh'));
    const log = path.join(root, 'calls');
    const stub = '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$TEST_CALLS"\n';
    fs.writeFileSync(path.join(root, 'bin/node'), stub, { mode: 0o755 });
    const python = path.join(root, 'bin/python');
    fs.writeFileSync(python, stub + 'if [[ "$1" != "-c" ]]; then exit "${TEST_ML_EXIT:-0}"; fi\n', { mode: 0o755 });
    const env = { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, PATTERN_SCANNER_PYTHON: python, TEST_CALLS: log };
    const ok = spawnSync('bash', [path.join(root, 'jobs/run.sh'), '--dry-run'], { env, encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stderr);
    const calls = fs.readFileSync(log, 'utf8');
    assert.match(calls, /build-privacy-linkage-edges.js --dry-run/);
    assert.match(calls, /build-privacy-batch-clusters.js --dry-run/);
    assert.match(calls, /ml-pattern-detector.py --dry-run/);
    const failed = spawnSync('bash', [path.join(root, 'jobs/run.sh')], { env: { ...env, TEST_ML_EXIT: '7' }, encoding: 'utf8' });
    assert.equal(failed.status, 7);
    assert.doesNotMatch(failed.stdout, /SCAN COMPLETE/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
