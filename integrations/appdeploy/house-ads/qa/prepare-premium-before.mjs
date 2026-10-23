import {spawn,spawnSync} from 'node:child_process';import {mkdirSync,mkdtempSync,symlinkSync,copyFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'tc-before-'));mkdirSync('qa-output',{recursive:true});
if(spawnSync('git',['cat-file','-e','c1b0ea6660ee141151e1b311a4db2e05a64d1cb1^{commit}']).status!==0){const fetch=spawnSync('git',['fetch','--no-tags','--depth=1','origin','c1b0ea6660ee141151e1b311a4db2e05a64d1cb1'],{stdio:'inherit'});if(fetch.status!==0)throw Error('baseline_fetch_failed');}
const repoRoot=spawnSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).stdout.trim();
const archive=spawnSync('git',['archive','c1b0ea6660ee141151e1b311a4db2e05a64d1cb1:integrations/appdeploy/house-ads'],{cwd:repoRoot,maxBuffer:8*1024*1024});if(archive.status!==0)throw Error('baseline_archive_failed');
const unpack=spawnSync('tar',['-x','-C',dir],{input:archive.stdout});if(unpack.status!==0)throw Error('baseline_extract_failed');
symlinkSync(resolve('node_modules'),join(dir,'node_modules'),'dir');copyFileSync('qa/sdk-browser-stub.ts',join(dir,'qa/sdk-browser-stub.ts'));
const build=spawnSync(resolve('node_modules/.bin/vite'),['build','--config','qa/vite.qa.config.mjs'],{cwd:dir,stdio:'inherit'});if(build.status!==0)throw Error('baseline_build_failed');
const server=spawn(resolve('node_modules/.bin/vite'),['preview','--config','qa/vite.qa.config.mjs','--port','4175'],{cwd:dir,stdio:'inherit',detached:true});
try{let ready=false;for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:4175/')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}if(!ready)throw Error('baseline_preview_not_ready');const run=spawnSync('node',['qa/premium-check.mjs','--before'],{stdio:'inherit',env:process.env});if(run.status!==0)throw Error('baseline_capture_failed');}finally{try{process.kill(-server.pid,'SIGTERM');}catch{}}
