'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTransfers, querySchema } = require('../../v1/lib/ask-transfers');
const { chat, selectionTask } = require('../../v1/lib/ask-chat');
const now = 1790339000000, end = now / 1000;
const query = { direction: 'deshield', pool: 'all', sort: 'both', hours: '24', limit: 5 };
const row = (id, time, amount) => ({ id, txid: id.toString(16).padStart(64, '0'), blockTime: time, blockHeight: time, flowType: 'deshield', pool: 'ironwood', amountZec: amount });
function client(all, pageSize = 100) { let calls = 0; return { get calls() { return calls; }, dispatch: async (method, path, options) => {
  calls++; assert.equal(method,'GET'); assert.equal(path,'/api/shielded/list'); assert.equal(options.query.flow_type,'deshield');
  const q=options.query; const matched=all.filter(r=>(!q.min_zec || r.amountZec>=Number(q.min_zec)) && (!q.cursor || r.blockTime<Number(q.cursor) || r.blockTime===Number(q.cursor) && r.id<Number(q.cursor_id)));
  const flows=matched.slice(0,pageSize); const last=flows.at(-1);
  return {ok:true,body:{success:true,flows,pagination:{hasNext:matched.length>flows.length,nextCursor:last?.blockTime,nextCursorId:last?.id}}};
} }; }
const signal = AbortSignal.timeout(10000);
test('largest covers later pages and differs from latest, retaining reported amount authority', async () => {
  const source=client([row(10,end-10,1),row(9,end-20,2),row(8,end-30,1000),row(7,end-40,5000),row(6,end-86401,9000)],2);
  const result=await loadTransfers({...query,limit:2},source,signal,now);
  assert.equal(result.complete,true); assert.equal(result.groups[0].rows[0].amountZat,'100000000');
  assert.equal(result.groups[1].rows[0].amountZat,'500000000000'); assert.equal(result.groups[1].rows.length,2);
  assert.equal(result.groups[1].rows[0].amountAuthority,'legacy-reported-zec');
});
test('thresholds expand when necessary, finding small transfers without claiming missing rows', async () => {
  const source=client([row(3,end-10,1),row(2,end-20,2000),row(1,end-30,200)]);
  const result=await loadTransfers({...query,sort:'largest'},source,signal,now);
  assert.equal(source.calls,3); assert.equal(result.complete,true); assert.equal(result.groups[0].rows.length,3);
  assert.deepEqual(result.groups[0].rows.map(r=>r.amountZat),['200000000000','20000000000','100000000']);
});
test('row ordering, duplicate transactions and invalid source values fail closed', async () => {
  for (const rows of [[row(1,end-10,1),row(1,end-10,1)],[row(1,end-20,1),row(2,end-10,1)],[{...row(1,end-10,1),txid:'https://bad'}],[{...row(1,end-10,1),amountZec:null}]]) await assert.rejects(loadTransfers({...query,sort:'latest'},client(rows),signal,now));
});
test('bounded incomplete window never exposes a largest ranking', async () => {
  const rows=Array.from({length:30},(_,i)=>row(100-i,end-i,2000)); const source=client(rows,1);
  const result=await loadTransfers({...query,sort:'largest'},source,signal,now);
  assert.equal(source.calls,20); assert.equal(result.complete,false); assert.deepEqual(result.groups[0].rows,[]);
});
test('empty results, inclusive window boundary and exact source integers', async () => {
  assert.deepEqual((await loadTransfers(query,client([]),signal,now)).groups[0].rows,[]);
  const source=client([{...row(2,end-86400,9000),amountZat:'9007199254740993'},row(1,end-86401,10000)]);
  const result=await loadTransfers({...query,sort:'largest',limit:1},source,signal,now);
  assert.equal(result.groups[0].rows.length,1); assert.equal(result.groups[0].rows[0].amountZat,'9007199254740993');
  assert.equal(result.groups[0].rows[0].amountAuthority,'exact-zatoshi');
});
test('query schema excludes SQL, hidden amounts and unbounded requests', () => {
  for (const change of [{hours:'168'},{limit:100},{direction:'fully_shielded'},{pool:'private'},{sql:'select secret'}]) assert.equal(querySchema.safeParse({...query,...change}).success,false);
  assert.match(selectionTask('').instruction,/Never substitute daily flows/);
});
test('contextual transfer intent returns structured rows rather than a daily chart', async () => {
  let calls=0;
  const result=await chat({question:'What are the latest and biggest 5 deshields?',page:'ask',context:null,locale:'auto',history:[]},async(body,task)=>{
    if (++calls===1) return task.validator.parse({intent:'transfers',transactionQuery: null, blockQuery:null,flowQuery:query,spec:null,topics:['pools'],locale:'en'});
    throw new Error('Transaction facts must not need a narration call');
  },client([row(1,Math.floor(Date.now()/1000)-10,1)]),signal,'');
  assert.equal(calls,1); assert.equal(result.spec,null); assert.equal(result.transfers.groups.length,2); assert.match(result.answer,/24 hours/);
});
