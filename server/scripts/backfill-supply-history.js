#!/usr/bin/env node
'use strict';
// Exact node chain state, never scheduled-subsidy subtraction or interpolation.
// Dry run: --from=2016-10-28 --to=2026-10-02 --plan=/private/path.json
// Apply the reviewed plan: --apply=/private/path.json
const fs = require('node:fs');
const DAY = 86400000;
const { supplyZat } = require('../api/lib/network-issuance');
const day = value => new Date(value).toISOString().slice(0, 10);
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && day(value) === value;
function validateRange(from, to) {
  if (!validDate(from) || !validDate(to) || from > to || (Date.parse(to) - Date.parse(from)) / DAY >= 4000 || to >= day(Date.now())) throw new Error('Provide at most 4000 completed UTC days');
}
function parseBlock(block, anchor) {
  const zat = supplyZat(block?.chainSupply?.chainValueZat);
  if (block?.hash !== anchor.hash || Number(block.height) !== Number(anchor.height) || Number(block.time) !== Number(anchor.timestamp) || zat === null || (zat === 0 && Number(block.height) !== 0) || (Number(block.height) > 0 && block.chainSupply.monitored !== true)) throw new Error('Invalid or mismatched authoritative block supply');
  return String(zat);
}
async function identity(db, rpc) {
  const genesis = (await db.query('SELECT hash FROM blocks WHERE height=0')).rows[0]?.hash;
  const info = await rpc('getblockchaininfo');
  if (!['main','test'].includes(info.chain) || !genesis || await rpc('getblockhash',[0]) !== genesis) throw new Error('Node/database network mismatch');
  const height=Number(info.blocks);
  if (!Number.isSafeInteger(height) || height<1) throw new Error('Invalid node checkpoint');
  return { chain: info.chain, genesisHash: genesis, checkpoint: { height, hash: await rpc('getblockhash',[height]) } };
}
async function buildPlan(db, rpc, from, to, progress = () => {}) {
  validateRange(from, to);
  const network = await identity(db, rpc);
  const start = Date.parse(from)/1000;
  const end = Date.parse(to)/1000 + DAY/1000;
  const tip = (await db.query('SELECT height,timestamp FROM blocks ORDER BY height DESC LIMIT 1')).rows[0];
  if (Number(tip?.timestamp) < end) throw new Error('Indexer has not reached the completed-day boundary');
  // Aggregate the bounded timestamp range once. Per-day max(height)
  // subqueries can make PostgreSQL scan the height index repeatedly.
  const { rows } = await db.query(`WITH dates AS (
    SELECT d::date AS date FROM generate_series($1::date,$2::date,'1 day') d
  ), daily AS MATERIALIZED (
    SELECT (to_timestamp(timestamp) AT TIME ZONE 'UTC')::date AS date,max(height) AS height
    FROM blocks WHERE timestamp >= $3 AND timestamp < $4 GROUP BY 1
  ), states AS (
    SELECT dates.date, greatest(max(daily.height) OVER(ORDER BY dates.date),
      (SELECT max(height) FROM blocks WHERE timestamp < $3)) AS height
    FROM dates LEFT JOIN daily USING(date)
  ) SELECT s.date::text AS date,b.height,b.hash,b.timestamp FROM states s JOIN blocks b ON b.height=s.height ORDER BY s.date`, [from,to,start,end]);
  if (rows.length !== (end-start)/86400) throw new Error('Incomplete daily chain anchors');
  const points = [];
  const blocks = new Map();
  const corrections = [];
  const read = async height => {
    if (!blocks.has(height)) {
      const block=await rpc('getblock',[String(height),1]);
      blocks.set(height,{height:block.height,hash:block.hash,time:block.time,chainSupply:block.chainSupply});
    }
    return blocks.get(height);
  };
  for (const row of rows) {
    let height=Number(row.height);
    let block;
    try {
      block=await read(height);
      const cutoff=Date.parse(row.date)/1000+86400;
      if (block.hash!==row.hash || Number(block.time)!==Number(row.timestamp)) {
        const original=height;
        // A stale indexed fork is only a date/height hint. Resolve its actual
        // canonical day boundary from the node until indexed ancestry agrees.
        while(Number(block.time)>=cutoff && original-height<1024 && height>0) block=await read(--height);
        let found=false;
        for(let next=height+1;next<=Math.min(original+1024,network.checkpoint.height);next++) {
          const actual=await read(next);
          if(Number(actual.time)<cutoff) {height=next;block=actual;}
          const indexed=(await db.query('SELECT hash,timestamp FROM blocks WHERE height=$1',[next])).rows[0];
          if(actual.hash===indexed?.hash && Number(actual.time)===Number(indexed.timestamp) && Number(actual.time)>=cutoff) {found=true;break;}
        }
        if(!found) throw new Error('Cannot establish canonical day boundary within 1024 blocks');
        corrections.push({date:row.date,indexedHeight:original,indexedHash:row.hash,nodeHeight:height,nodeHash:block.hash});
      }
      if(Number(block.time)>=cutoff || height>network.checkpoint.height || (points.length && height<points.at(-1).blockHeight)) throw new Error('Invalid day boundary');
      const zat=parseBlock(block,{hash:block.hash,height,timestamp:block.time});
      points.push({date:row.date,blockHeight:height,blockHash:block.hash,blockTime:Number(block.time),circulatingZat:zat});
    } catch(error) {throw new Error(`${row.date} height ${height}: ${error.message}`);}
    if (points.length % 100 === 0) progress({ completed: points.length, total: rows.length, date: row.date });
  }
  if(await rpc('getblockhash',[network.checkpoint.height])!==network.checkpoint.hash) throw new Error('Node ancestry changed during replay');
  return { version:2, ...network, from,to,generatedAt:new Date().toISOString(),corrections,points };
}

async function applyPlan(db, rpc, plan) {
  validateRange(plan.from,plan.to);
  const network = await identity(db,rpc);
  if (plan.version !== 2 || !Number.isSafeInteger(plan.checkpoint?.height) || !/^[a-f0-9]{64}$/.test(plan.checkpoint?.hash ?? '') || network.chain !== plan.chain || network.genesisHash !== plan.genesisHash || !Array.isArray(plan.points) || plan.points.length !== (Date.parse(plan.to)-Date.parse(plan.from))/DAY+1) throw new Error('Invalid repair plan/network');
  for (let i=0;i<plan.points.length;i++) {
    const p=plan.points[i];
    if (p.date !== day(Date.parse(plan.from)+i*DAY) || !Number.isSafeInteger(p.blockHeight) || p.blockHeight<0 || p.blockHeight>plan.checkpoint.height || !/^[a-f0-9]{64}$/.test(p.blockHash) || !Number.isSafeInteger(p.blockTime) || p.blockTime>=Date.parse(p.date)/1000+86400 || supplyZat(p.circulatingZat)===null || (p.circulatingZat==='0' && p.blockHeight!==0)) throw new Error('Invalid repair point');
  }
  await db.query('BEGIN');
  try {
    await db.query("SET LOCAL lock_timeout='2s'");
    await db.query("SET LOCAL statement_timeout='30s'");
    if (!(await db.query('SELECT pg_try_advisory_xact_lock(20261003,32) AS acquired')).rows[0].acquired) throw new Error('Supply repair already active');
    if ((await db.query('SELECT pg_is_in_recovery() AS recovery')).rows[0].recovery) throw new Error('Standby writes prohibited');
    if(await rpc('getblockhash',[plan.checkpoint.height])!==plan.checkpoint.hash) throw new Error('Node ancestry changed since plan creation');
    const previous=(await db.query('SELECT * FROM chain_supply_archive_state WHERE id=true FOR UPDATE')).rows[0];
    if(previous && (previous.chain!==plan.chain || previous.genesis_hash!==plan.genesisHash)) throw new Error('Existing archive belongs to another network');
    if(previous && await rpc('getblockhash',[Number(previous.verified_height)])!==previous.verified_hash) {
      const range=(await db.query('SELECT min(date)::text AS first,max(date)::text AS last FROM chain_supply_daily')).rows[0];
      if(range.first<plan.from || range.last>plan.to) throw new Error('Changed node ancestry requires replay of the entire archived range');
    }
    let inserted=0;
    for(const p of plan.points) {
      const result=await db.query(`INSERT INTO chain_supply_daily(date,block_height,block_hash,block_time,chain_supply_zat) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(date) DO UPDATE SET block_height=EXCLUDED.block_height,block_hash=EXCLUDED.block_hash,block_time=EXCLUDED.block_time,chain_supply_zat=EXCLUDED.chain_supply_zat,computed_at=now()
        WHERE chain_supply_daily.block_hash<>EXCLUDED.block_hash OR chain_supply_daily.chain_supply_zat<>EXCLUDED.chain_supply_zat`,[p.date,p.blockHeight,p.blockHash,p.blockTime,p.circulatingZat]);
      inserted+=result.rowCount;
    }
    await db.query(`INSERT INTO chain_supply_archive_state(id,chain,genesis_hash,verified_height,verified_hash) VALUES(true,$1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET chain=EXCLUDED.chain,genesis_hash=EXCLUDED.genesis_hash,verified_height=EXCLUDED.verified_height,verified_hash=EXCLUDED.verified_hash,verified_at=now()`,[plan.chain,plan.genesisHash,plan.checkpoint.height,plan.checkpoint.hash]);
    await db.query('COMMIT');return { changed:inserted,points:plan.points.length,chain:plan.chain,from:plan.from,to:plan.to };
  }catch(e){await db.query('ROLLBACK');throw e;}
}
if(require.main===module){
  const {loadEnv}=require('../lib/job-utils');loadEnv(__dirname);
  const {getPool}=require('../lib/db-pool');const {callZebraRPC:rpc}=require('../lib/zebra-rpc');
  const db=getPool({max:1});
  const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
  (async()=>{if(args.apply){console.log(JSON.stringify(await applyPlan(db,rpc,JSON.parse(fs.readFileSync(args.apply,'utf8')))));}
    else {if(!args.plan)throw new Error('Supply --plan path required');const plan=await buildPlan(db,rpc,args.from,args.to,p=>console.log(JSON.stringify(p)));fs.writeFileSync(args.plan,JSON.stringify(plan),{mode:0o600});console.log(JSON.stringify({plan:args.plan,chain:plan.chain,points:plan.points.length,from:plan.from,to:plan.to,first:plan.points[0],last:plan.points.at(-1)}));}
  })().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.end());
}
module.exports={validateRange,parseBlock,buildPlan,applyPlan};
