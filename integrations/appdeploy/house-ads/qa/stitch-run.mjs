import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readdirSync} from 'node:fs';
const out='qa-output/stitch-fidelity';mkdirSync(out,{recursive:true});const checks=[];
function run(name,command,args){const r=spawnSync(command,args,{stdio:'inherit',env:process.env});checks.push({name,status:r.status===0?'passed':'failed',exitCode:r.status});writeFileSync(out+'/build-results.json',JSON.stringify(checks,null,2));if(r.status!==0)throw Error(name+' failed');}
run('application node suites','node',['--test',...readdirSync('tests').filter(f=>f.endsWith('.test.mjs')).map(f=>'tests/'+f)]);
run('strict TypeScript with existing reference SDK contract','npx',['tsc','-p','qa/tsconfig.stitch.json']);
run('isolated React preview build','npx',['vite','build','--config','qa/vite.stitch-preview.config.mjs']);
run('native frontend build, platform SDK external','npx',['vite','build','--config','qa/vite.stitch-native.config.mjs']);
const server=spawn('node',['node_modules/vite/bin/vite.js','preview','--config','qa/vite.stitch-preview.config.mjs'],{stdio:'inherit'});
try{
  let ready=false;for(let n=0;n<40;n++){try{if((await fetch('http://127.0.0.1:4174/')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
  if(!ready)throw Error('Preview server did not start');
  run('browser checks and actual screenshots','node',['qa/stitch-browser-check.mjs']);
}finally{
  server.kill('SIGTERM');
  const r=spawnSync('python',['qa/stitch-compose.py'],{stdio:'inherit'});if(r.status!==0)process.exitCode=1;
}
