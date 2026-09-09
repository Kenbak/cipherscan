const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeSwap,fetchDay,applyPlan}=require('../scripts/repair-crosschain-gaps');
const tokenMap=new Map([['asset-zec',{chain:'zec',token:'ZEC'}],['asset-eth',{chain:'eth',token:'ETH'}]]);
const tx={status:'SUCCESS',depositAddress:'deposit',createdAt:'2026-07-10T12:00:00Z',originAsset:'asset-eth',destinationAsset:'asset-zec',amountInFormatted:'0.123456789012345678',amountOutFormatted:'1',amountInUsd:'5.25',amountOutUsd:'5.20',destinationChainTxHashes:['a'.repeat(64)]};

test('swap repair retains exact decimal amounts and verifies date, direction, assets and hashes',()=>{
  const row=normalizeSwap(tx,'inflow',tokenMap,'2026-07-10');
  assert.equal(row.source_amount,'0.123456789012345678');assert.equal(row.zec_txid,'a'.repeat(64));
  for(const patch of [{status:'PENDING'},{createdAt:'2026-07-11T00:00:00Z'},{originAsset:'unknown'},{destinationChainTxHashes:['not-a-hash']}])assert.throws(()=>normalizeSwap({...tx,...patch},'inflow',tokenMap,'2026-07-10'));
  assert.throws(()=>normalizeSwap(tx,'outflow',tokenMap,'2026-07-10'));
});

test('upstream pagination must finish and cannot repeat swaps',async()=>{
  let requests=0;
  const first=Array.from({length:1000},(_,i)=>({...tx,depositAddress:'d'+i}));
  const rows=await fetchDay('inflow','2026-07-10',async params=>{
    assert.equal(params.startTimestamp,'2026-07-10T00:00:00Z');
    if(requests++===0)return first;
    assert.equal(params.lastDepositAddress,'d999');return [tx];
  });
  assert.equal(rows.length,1001);
  await assert.rejects(fetchDay('inflow','2026-07-10',async()=>first),/repeated/);
});

test('swap writes are missing-only and rollback on failure',async()=>{
  const row=normalizeSwap(tx,'inflow',tokenMap,'2026-07-10');
  const plan={version:1,coverage:[{direction:'inflow',day:'2026-07-10'}],rows:[row]};
  const calls=[];
  const db={async query(sql){calls.push(sql);if(sql.startsWith('INSERT')){assert.match(sql,/ON CONFLICT\(deposit_address\) DO NOTHING/);return {rowCount:0}}return {rows:[]}}};
  assert.equal(await applyPlan(db,plan),0);assert.equal(calls.at(-1),'COMMIT');
  const failed=[];
  await assert.rejects(applyPlan({async query(sql){failed.push(sql);if(sql.startsWith('INSERT'))throw Error('failure');return {rows:[]}}},plan));
  assert.equal(failed.at(-1),'ROLLBACK');
});
