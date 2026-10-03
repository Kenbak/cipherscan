#!/usr/bin/env node
'use strict';
// Keep completed days permanently, independently of hourly snapshot retention.
const { loadEnv } = require('../lib/job-utils');
loadEnv(__dirname);
const { getPool } = require('../lib/db-pool');
const { callZebraRPC } = require('../lib/zebra-rpc');
const { buildPlan, applyPlan } = require('../scripts/backfill-supply-history');
const db = getPool({ max: 1 });
const date = days => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
(async () => console.log(JSON.stringify(await applyPlan(db, callZebraRPC, await buildPlan(db, callZebraRPC, date(7), date(1))))))()
  .catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => db.end());
