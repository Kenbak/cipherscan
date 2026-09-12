#!/usr/bin/env node
// Read-only file/commit checks; never reads env files or changes services/databases.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const manifest=require('../deploy/mining-backend-manifest.json');
const args=process.argv.slice(2);
if(args.length!==0 && !(args.length===2 && args[0]==='--baseline'))throw new Error('Usage: check-mining-release.js [--baseline /path/to/production-checkout]');
const target=args.length?path.resolve(args[1]):root;
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const git=(...args)=>execFileSync('git',['-C',target,...args],{encoding:'utf8'}).trim();
if(args.length){
 if(git('rev-parse','HEAD')!==manifest.baseline_commit)throw new Error('Production commit changed; rebase and repeat acceptance before deploying');
 if(git('status','--porcelain','--untracked-files=no'))throw new Error('Production has tracked modifications; inspect before deploying');
}
for(const entry of manifest.runtime_files){
 const filename=path.join(target,entry.path);
 const expected=args.length?entry.baseline_sha256:entry.release_sha256;
 if(expected===null){if(fs.existsSync(filename))throw new Error(`Unexpected existing file: ${entry.path}`);continue;}
 if(!fs.existsSync(filename)||sha(fs.readFileSync(filename))!==expected)throw new Error(`Fingerprint mismatch: ${entry.path}`);
}
console.log(JSON.stringify({verified:args.length?'production-baseline':'candidate-runtime',baseline:manifest.baseline_commit,files:manifest.runtime_files.length,mutations:false}));
