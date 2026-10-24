import {spawn,spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {writeFileSync,readFileSync,existsSync} from 'node:fs';
function run(command,args){const r=spawnSync(command,args,{stdio:'inherit',env:process.env});if(r.status!==0)throw Error(command+' failed');}
// Candidate tests use localhost and an isolated SDK adapter. The visual review first reads the live public catalog without mutations. Never deploys.
run('npm',[(existsSync('package-lock.json')?'ci':'install'),'--ignore-scripts','--no-audit','--no-fund','--fetch-retries=0']);
if(!existsSync('/usr/bin/google-chrome'))run('npx',['playwright','install','--with-deps','chromium']);
if(process.env.AD_IMAGE_CHECKS==='1')run('node',['qa/capture-real-public-feed.mjs']);
run('npx',['vite','build','--config','qa/vite.qa.config.mjs']);
// SDK contract types are an offline test declaration, not a replacement SDK runtime.
const tscConfig={compilerOptions:{target:'ES2022',module:'ESNext',moduleResolution:'bundler',skipLibCheck:true,strict:true,noEmit:true,jsx:'react-jsx',types:['node'],allowSyntheticDefaultImports:true},include:['shared/*.ts','src/**/*.tsx','src/**/*.ts','src/site-menu.tsx','src/owned-publication-editor.tsx','src/legal-responsible.ts','src/reading-history.ts','src/compact-presentation.ts','src/territorial-radar.tsx','src/activity-center.tsx','backend/security-headers.ts','backend/house-marketing.ts','qa/sdk-contract.d.ts']};
writeFileSync('qa/tsconfig.json',JSON.stringify({...tscConfig,include:tscConfig.include.map(p=>'../'+p)},null,2));
run('npx',['tsc','-p','qa/tsconfig.json']);
run('npx',['esbuild','backend/index.ts','--bundle','--platform=node','--format=esm','--packages=external','--outfile=qa-output/backend-candidate.mjs']);
if(process.env.RC_CHECKS==='1')run('node',['qa/rc-local-check.mjs']);
run('node',['qa/prepare-mobile-before.mjs']);
if(process.env.AD_IMAGE_CHECKS==='1')run('node',['qa/prepare-premium-before.mjs']);
else if(process.env.UI_CHECKS==='1')run('node',['qa/prepare-before.mjs']);
const server=spawn('npx',['vite','preview','--config','qa/vite.qa.config.mjs'],{stdio:'inherit',detached:true});
try{
 let ready=false;
 for(let i=0;i<60;i++){try{const r=await fetch('http://127.0.0.1:4174/');if(r.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,500));}
 if(!ready)throw Error('localhost_preview_not_ready');
 run('node',['qa/browser-check.mjs']);
 run('node',['qa/layout-check.mjs']);
 run('node',['qa/mobile-final-check.mjs']);
 run('node',['qa/ui-integral-check.mjs']);
 if(process.env.RC_CHECKS!=='1')run('node',['qa/capacity-check.mjs']);
 run('node',['qa/publication-check.mjs']);
 if(process.env.RC_CHECKS==='1')run('node',['qa/rc-browser-check.mjs']);
 if(process.env.AD_IMAGE_CHECKS==='1'){run('node',['qa/premium-check.mjs']);run('node',['qa/ad-images-check.mjs','--commercial-only']);run('node',['qa/live-ui-check.mjs']);run('node',['qa/build-ui-gallery.mjs']);}
 else if(process.env.UI_CHECKS==='1')run('node',['qa/territorial-ui-check.mjs']);
}finally{try{process.kill(-server.pid,'SIGTERM');}catch{}}
