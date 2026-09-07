/** Isolated read-only source for private v1 acceptance. Never run as the public API. */
if (!process.env.V1_SOURCE_ENV_FILE) throw new Error('Provide the private source environment file explicitly.');
if (process.env.V1_PRIVATE_SOURCE !== 'true') throw new Error('Set V1_PRIVATE_SOURCE=true for this isolated test process.');
require('dotenv').config({ path: process.env.V1_SOURCE_ENV_FILE, quiet: true });
const express = require('express');
const { Pool } = require('pg');
const { createInternalClient } = require('./v1/lib/internal-client');
const { loadV1Config } = require('./v1/config');
const { injectDependencies } = require('./routes/transactions/_helpers');
const txLists = require('./routes/transactions/tx-lists');
const addresses = require('./routes/address');
const valuation = require('./routes/valuation');
const app = express();
const pool = new Pool({ host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  max: 2, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000,
  options: '-c default_transaction_read_only=on -c statement_timeout=8000 -c lock_timeout=1000',
  application_name: 'zecblock-private-v1-acceptance',
});
const source = createInternalClient(loadV1Config({ V1_INTERNAL_API_BASE_URL: 'http://127.0.0.1:3001', V1_INTERNAL_TIMEOUT_MS: '10000' }));
app.locals.pool = pool; app.locals.queryWithFallback = pool.query.bind(pool); app.locals.chainTip = { height: 0 };
app.use((req,res,next)=>{
  res.set('X-Robots-Tag','noindex, nofollow');res.set('Cache-Control','no-store');
  if(!['GET','HEAD'].includes(req.method))return res.status(405).json({error:'Read-only private source'});
  next();
});
app.get('/__preview',async(req,res)=>{
  try { const result=await pool.query('SHOW default_transaction_read_only');res.json({private:true,readOnly:result.rows[0].default_transaction_read_only==='on'}); }
  catch {res.status(503).json({error:'Read-only database unavailable'});}
});
app.use(injectDependencies,txLists,addresses);
app.use((req,res,next)=>req.path==='/api/valuation/search-interest' ? valuation(req,res,next) : next());
app.use(async(req,res)=>{
  if(!req.path.startsWith('/api/') && req.path!='/health')return res.status(404).json({error:'Not found'});
  try {
    const result=await source.dispatch('GET',req.path,{query:new URLSearchParams(req.query)});
    for(const [key,value] of Object.entries(result.headers))res.set(key,value);
    res.status(result.status).json(result.body);
  } catch {res.status(502).json({error:'Legacy source unavailable'});}
});
const server=app.listen(3003,'127.0.0.1',()=>console.log('Private read-only source listening on 127.0.0.1:3003'));
async function close(){server.closeAllConnections();server.close();await pool.end();process.exit(0);}
process.on('SIGINT',close);process.on('SIGTERM',close);
