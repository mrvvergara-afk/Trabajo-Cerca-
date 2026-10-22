import {spawn,spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {writeFileSync,readFileSync,existsSync} from 'node:fs';
function run(command,args){const r=spawnSync(command,args,{stdio:'inherit',env:process.env});if(r.status!==0)throw Error(command+' failed');}
// Runs only against localhost and mock SDK. Never deploys or reads live app data.
run('npm',['install','--ignore-scripts','--no-audit','--no-fund','--package-lock=false','--fetch-retries=0']);
run('npm',['install','--no-save','--ignore-scripts','--no-audit','--no-fund','--package-lock=false','playwright@1.58.2','@types/node@22.13.4']);
if(!existsSync('/usr/bin/google-chrome'))run('npx',['playwright','install','--with-deps','chromium']);
run('npx',['vite','build','--config','qa/vite.qa.config.mjs']);
// SDK contract types are an offline test declaration, not a replacement SDK runtime.
const tscConfig={compilerOptions:{target:'ES2022',module:'ESNext',moduleResolution:'bundler',skipLibCheck:true,strict:true,noEmit:true,jsx:'react-jsx',types:['node'],allowSyntheticDefaultImports:true},include:['shared/*.ts','src/house-*.tsx','src/site-menu.tsx','backend/house-marketing.ts','qa/sdk-contract.d.ts']};
writeFileSync('qa/tsconfig.json',JSON.stringify({...tscConfig,include:tscConfig.include.map(p=>'../'+p)},null,2));
run('npx',['tsc','-p','qa/tsconfig.json']);
const server=spawn('npx',['vite','--config','qa/vite.qa.config.mjs'],{stdio:'inherit',detached:true});
try{
 let ready=false;
 for(let i=0;i<60;i++){try{const r=await fetch('http://127.0.0.1:4174/');if(r.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,500));}
 if(!ready)throw Error('localhost_preview_not_ready');
 run('node',['qa/browser-check.mjs']);
 run('node',['qa/layout-check.mjs']);
 run('node',['qa/capacity-check.mjs']);
 run('node',['qa/publication-check.mjs']);
}finally{try{process.kill(-server.pid,'SIGTERM');}catch{}}
