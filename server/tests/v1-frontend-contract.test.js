const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, imports = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require','module','exports',code)(name => imports[name] || require(name), module, module.exports);
  return module.exports;
}
const api = load('lib/api-client.ts');
const { fetchCompactScan } = load('lib/scan-api.ts', { '@/lib/api-client': api });
const response = data => new Response(JSON.stringify({ data, meta: { requestId: 'test', network: 'mainnet' } }));
test('scanner divides a 50k block window without gaps and transmits only heights', async t => {
  const original = global.fetch; t.after(()=>{global.fetch=original;});
  const requests = [], progress = [];
  global.fetch = async (url, init) => { requests.push({url,body:JSON.parse(init.body)}); return response({blocks:[JSON.parse(init.body).startHeight]}); };
  const result = await fetchCompactScan('http://localhost:3002',1,50000,new AbortController().signal,p=>progress.push(p));
  assert.deepEqual(requests.map(r=>r.body), Array.from({length:5},(_,i)=>({startHeight:i*10000+1,endHeight:(i+1)*10000})));
  assert(requests.every(r=>r.url.endsWith('/v1/scan/lightwalletd')));
  assert.deepEqual(result.blocks,[1,10001,20001,30001,40001]); assert.equal(progress.at(-1),1);
  await assert.rejects(()=>fetchCompactScan('',1,50001,new AbortController().signal),/50,000/);
});
test('scanner cancellation interrupts Retry-After without issuing another request', async t => {
  const original = global.fetch; t.after(()=>{global.fetch=original;});
  let count=0; const controller = new AbortController();
  global.fetch = async()=>{count++;setTimeout(()=>controller.abort(new Error('cancelled')),20);return new Response(JSON.stringify({detail:'Rate limited'}),{status:429,headers:{'Retry-After':'60'}});};
  await assert.rejects(()=>fetchCompactScan('',1,2,controller.signal),/cancelled/); assert.equal(count,1);
});
test('scanner never retries earlier than a long Retry-After', async t => {
  const original = global.fetch; t.after(()=>{global.fetch=original;}); let count=0;
  global.fetch=async()=>{count++;return new Response('{}',{status:429,headers:{'Retry-After':'3600'}});};
  await assert.rejects(()=>fetchCompactScan('',1,2,new AbortController().signal),e=>e.status===429);assert.equal(count,1);
});
test('shared parser rejects legacy responses and preserves building/error semantics', async()=>{
  await assert.rejects(()=>api.readApiData(new Response(JSON.stringify({success:true,price:12}))),/incompatible/);
  await assert.rejects(()=>api.readApiData(new Response(JSON.stringify({detail:'Preparing data',code:'building'}),{status:503})),e=>e.status===503&&e.code==='building');
  assert.equal(await api.readApiData(response(null)),null);
  await assert.rejects(()=>api.readApiCollection(response([])),/invalid collection/);
});
test('transaction metadata resolves pending and missing v1 mempool records without a legacy success flag', async () => {
  const txid = 'a'.repeat(64);
  for(const inMempool of [true,false]) {
    const seo = load('lib/seo.ts', {
      '@/lib/api-client': api, react: { cache: fn=>fn },
      '@/lib/network': { getConfiguredNetwork: ()=>'mainnet' },
      '@/lib/api-config': { getApiUrlForNetwork: ()=>'http://localhost:3002' },
      '@/lib/server-fetch': { fetchWithDeadline: async url => url.endsWith('/summary')
        ? new Response(null,{status:404})
        : response({inMempool,transaction:inMempool ? {txid,type:'shielded',firstSeen:1700000000} : null}) },
    });
    const result = await seo.getTxResolution(txid);
    assert.equal(result.state,inMempool?'found':'absent');
    if(inMempool) { assert.equal(result.meta.status,'pending'); assert.equal(result.meta.txid,txid); }
  }
});
