#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const columns = ['deposit_address','direction','status','source_chain','source_token','source_amount','source_amount_usd','source_tx_hashes','dest_chain','dest_token','dest_amount','dest_amount_usd','dest_tx_hashes','zec_txid','zec_address','near_tx_hashes','senders','recipient','matched','match_attempts','swap_created_at','raw_origin_asset','raw_dest_asset'];
const dayAfter = day => new Date(Date.parse(day) + 86400000).toISOString().slice(0,10);
function decimal(value) {
  const text = String(value ?? '0');
  if (!/^\d{1,40}(\.\d{1,30})?$/.test(text)) throw new Error('Invalid upstream amount');
  return text;
}
function normalizeSwap(tx, direction, tokenMap, day) {
  if (!['inflow','outflow'].includes(direction) || tx.status !== 'SUCCESS' || typeof tx.depositAddress !== 'string' || !tx.depositAddress || tx.depositAddress.length > 512 || typeof tx.createdAt !== 'string' || !Number.isFinite(Date.parse(tx.createdAt)) || new Date(tx.createdAt).toISOString().slice(0,10) !== day) throw new Error('Upstream returned an invalid/out-of-window swap');
  const source = tokenMap.get(tx.originAsset); const dest = tokenMap.get(tx.destinationAsset);
  if (!source || !dest || (direction === 'inflow' ? dest.chain !== 'zec' : source.chain !== 'zec')) throw new Error('Unverified swap asset/direction');
  const list = value => { if (value === undefined || value === null) return []; if (!Array.isArray(value) || value.some(v=>typeof v!=='string')) throw new Error('Invalid hash/address list'); return value; };
  const originHashes = list(tx.originChainTxHashes); const destHashes = list(tx.destinationChainTxHashes);
  const zecHashes = direction === 'inflow' ? destHashes.length ? destHashes : source.chain === 'zec' ? originHashes : [] : originHashes.length ? originHashes : dest.chain === 'zec' ? destHashes : [];
  const hash = zecHashes[0] || null;
  if (hash && !/^[a-fA-F0-9]{64}$/.test(hash)) throw new Error('Invalid Zcash hash');
  return { deposit_address: tx.depositAddress, direction, status: 'SUCCESS', source_chain: source.chain, source_token: source.token, source_amount: decimal(tx.amountInFormatted), source_amount_usd: decimal(tx.amountInUsd), source_tx_hashes: originHashes, dest_chain: dest.chain, dest_token: dest.token, dest_amount: decimal(tx.amountOutFormatted), dest_amount_usd: decimal(tx.amountOutUsd), dest_tx_hashes: destHashes, zec_txid: hash, zec_address: null, near_tx_hashes: list(tx.nearTxHashes), senders: list(tx.senders), recipient: tx.recipient || null, matched: false, match_attempts: 0, swap_created_at: tx.createdAt, raw_origin_asset: tx.originAsset, raw_dest_asset: tx.destinationAsset };
}
async function fetchDay(direction, day, request) {
  const rows = []; const seen = new Set(); let cursor;
  for (let page=0;page<20;page++) {
    const params = { statuses:'SUCCESS',numberOfTransactions:'1000',direction:'next',startTimestamp:day+'T00:00:00Z',endTimestamp:dayAfter(day)+'T00:00:00Z',[direction==='inflow'?'toChainId':'fromChainId']:'zec',...(cursor ? {lastDepositAddress:cursor.depositAddress,lastDepositMemo:cursor.depositMemo||''}: {}) };
    const data = await request(params);
    if (!Array.isArray(data) || data.length > 1000) throw new Error('Invalid upstream batch');
    for (const row of data) {
      const key = JSON.stringify([row.depositAddress,row.depositMemo||'']);
      if (seen.has(key)) throw new Error('Upstream pagination repeated a swap');
      seen.add(key); rows.push(row);
    }
    if (data.length < 1000) return rows;
    cursor = data.at(-1);
  }
  throw new Error('Upstream day exceeds bounded pagination');
}
async function missingDays(db) {
  return (await db.query(`WITH ds AS (SELECT DISTINCT (swap_created_at AT TIME ZONE 'UTC')::date AS day,direction FROM cross_chain_swaps WHERE status='SUCCESS'), spans AS (SELECT direction,min(day) first_day,max(day) last_day FROM ds GROUP BY direction)
    SELECT s.direction,d::date::text AS day FROM spans s CROSS JOIN LATERAL generate_series(first_day,last_day,'1 day') d
    WHERE d::date < (NOW() AT TIME ZONE 'UTC')::date AND NOT EXISTS(SELECT 1 FROM ds WHERE ds.direction=s.direction AND ds.day=d::date) ORDER BY d,s.direction`)).rows;
}
async function applyPlan(db, plan) {
  if (plan.version !== 1 || !Array.isArray(plan.rows) || plan.rows.length > 100000 || !Array.isArray(plan.coverage)) throw new Error('Invalid swap repair plan');
  const coverage = new Set(plan.coverage.map(c=>`${c.direction}:${c.day}`));
  await db.query('BEGIN');
  try {
    await db.query("SET LOCAL lock_timeout='2s'");
    await db.query("SET LOCAL statement_timeout='30s'");
    let inserted=0;
    for (const row of plan.rows) {
      if (Object.keys(row).length !== columns.length || columns.some(c=>!Object.hasOwn(row,c)) || !coverage.has(`${row.direction}:${String(row.swap_created_at).slice(0,10)}`) || row.status !== 'SUCCESS') throw new Error('Invalid row in swap repair plan');
      const result = await db.query(`INSERT INTO cross_chain_swaps (${columns.join(',')}) VALUES (${columns.map((_,i)=>'$'+(i+1)).join(',')}) ON CONFLICT(deposit_address) DO NOTHING`,columns.map(c=>row[c]));
      inserted+=result.rowCount;
    }
    await db.query('COMMIT');
    return inserted;
  } catch(error) {await db.query('ROLLBACK');throw error;}
}
async function main() {
  const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
  if (!args.env || (!args.plan && !args['apply-plan'])) throw new Error('Use --env=/server/api/.env --plan=/private/plan.json OR --apply-plan=/private/plan.json');
  require('dotenv').config({path:args.env,quiet:true});
  if(args['jobs-env'])require('dotenv').config({path:args['jobs-env'],quiet:true});
  const {Client}=require('pg');
  const db=new Client({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||5432),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,statement_timeout:30000,application_name:'crosschain-gap-repair'});
  await db.connect();
  try {
    if(args['apply-plan']) {console.log(JSON.stringify({inserted:await applyPlan(db,JSON.parse(fs.readFileSync(args['apply-plan'],'utf8')))}));return;}
    if(!process.env.NEAR_INTENTS_API_KEY)throw new Error('Upstream key unavailable');
    const gaps=await missingDays(db);
    if(gaps.length>100)throw new Error('More than 100 missing direction-days; narrow the audit before repair');
    console.log(JSON.stringify({gaps}));
    const response=await fetch('https://1click.chaindefuser.com/v0/tokens',{signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error('Token map unavailable');
    const tokens=await response.json();
    const tokenMap=new Map(tokens.filter(t=>t.assetId&&t.blockchain&&t.symbol).map(t=>[t.assetId,{chain:t.blockchain==='trx'?'tron':t.blockchain==='bnb'?'bsc':t.blockchain,token:t.symbol.toUpperCase()}]));
    const plan={version:1,generatedAt:new Date().toISOString(),coverage:[],rows:[]};
    for(const {direction,day} of gaps) {
      const rows=await fetchDay(direction,day,async params=>{
        const url=new URL('https://explorer.near-intents.org/api/v0/transactions');
        for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
        for(let attempt=0;attempt<3;attempt++) {
          try {
            const r=await fetch(url,{headers:{Authorization:`Bearer ${process.env.NEAR_INTENTS_API_KEY}`,Accept:'application/json'},signal:AbortSignal.timeout(30000)});
            if(!r.ok)throw new Error('Upstream status '+r.status);
            return await r.json();
          } catch(error) {if(attempt===2)throw error; await new Promise(resolve=>setTimeout(resolve,2000));}
        }
      });
      const normalized=rows.map(row=>normalizeSwap(row,direction,tokenMap,day));
      const hashes=[...new Set(normalized.map(r=>r.zec_txid).filter(Boolean))];
      const matched=new Set(hashes.length?(await db.query('SELECT txid FROM transactions WHERE txid=ANY($1::text[])',[hashes])).rows.map(r=>r.txid):[]);
      for(const row of normalized)row.matched=matched.has(row.zec_txid);
      plan.rows.push(...normalized);plan.coverage.push({direction,day,count:rows.length});
      console.log(JSON.stringify({direction,day,upstreamSwaps:rows.length}));
    }
    fs.writeFileSync(args.plan,JSON.stringify(plan,null,2)+'\n',{mode:0o600,flag:'wx'});
    console.log(JSON.stringify({plan:args.plan,rows:plan.rows.length}));
  } finally {await db.end();}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={normalizeSwap,fetchDay,applyPlan};
