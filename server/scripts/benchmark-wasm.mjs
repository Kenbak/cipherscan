// Synthetic fixtures only. Never pass a real viewing key in arguments or saved fixtures.
// SCAN_FIXTURE_PATH=/tmp/scan.json cargo test --manifest-path wasm/Cargo.toml export_public_synthetic_fixture_when_requested
// node server/scripts/benchmark-wasm.mjs /tmp/scan.json /path/to/wasm-build [...builds]
import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
const [fixturePath, ...builds] = process.argv.slice(2);
const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'));
const record = Uint8Array.from(fixture.records.slice(0, 149));
const count = 512;
const bytes = new Uint8Array(count * 149);
for (let i = 0; i < count; i++) bytes.set(record, i * 149);
const legacy = bytes.slice();
for (let i = 0; i < count; i++) legacy[i * 149] = 0;
const h = (a, b) => Buffer.from(record.slice(a, b)).toString('hex');
const output = { nullifier: h(1,33), cmx: h(33,65), ephemeral_key: h(65,97), ciphertext: h(97,149), txid: 'fixture', height: 1 };
const json = JSON.stringify(Array.from({length:count}, () => output));
function bench(fn) {
  fn(); const samples = [];
  for (let i=0; i<5; i++) { const start = performance.now(); fn(); samples.push(performance.now()-start); }
  samples.sort((a,b)=>a-b); return Number(samples[2].toFixed(3));
}
for (const build of builds) {
  const source = await fs.readFile(path.join(build,'zcash_wasm.js'),'utf8');
  const binary = await fs.readFile(path.join(build,'zcash_wasm_bg.wasm'));
  const wasm = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${encodeURIComponent(build)}`);
  const start = performance.now();
  wasm.initSync({module:binary});
  const initMs = performance.now()-start;
  const result = {build, bytes:binary.length, gzipBytes:gzipSync(binary).length, initMs:Number(initMs.toFixed(3)), actions:count,
    legacyJsonMs:bench(()=>wasm.batch_filter_compact_outputs(json,fixture.key))};
  if (wasm.ScanSession) {
    const session = new wasm.ScanSession(fixture.key);
    result.binaryUnknownMs = bench(()=>session.filter_compact(legacy));
    result.binaryTaggedMs = bench(()=>session.filter_compact(bytes));
    result.memoMs = bench(()=>session.decrypt_memos(fixture.tx));
    session.free();
  }
  console.log(JSON.stringify(result));
}
