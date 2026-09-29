#!/usr/bin/env node
'use strict';

// Read-only production replay: no X client, token refresh, outbox writes, or
// Telegram messages. --output writes review evidence to a local JSON file.
const fs = require('fs');
const { loadEnv } = require('../lib/job-utils');
loadEnv(__dirname);
const { getPool, getReadPool } = require('../lib/db-pool');
const { run } = require('./jobs/editorial');
const pool = getPool(), reader = getReadPool();
run(pool,{dryRun:true},{reader}).then(result => {
  const file = process.argv.find(a => a.startsWith('--output='))?.slice(9);
  if (file) fs.writeFileSync(file,JSON.stringify(result,null,2));
  console.log(JSON.stringify({candidates:result.candidates?.length,selected:result.selected?.length,decisions:result.decisions},null,2));
}).catch(error => { console.error(error.message); process.exitCode=1; })
  .finally(async () => { await pool.end(); if (reader!==pool) await reader.end(); });
