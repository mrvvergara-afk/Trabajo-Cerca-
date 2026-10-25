// No deployment, credentials, collectors or production writes. SDK calls in the
// browser candidate use an adapter; actual public catalog is read separately.
import {spawn,spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,writeFileSync,readFileSync,unlinkSync} from 'node:fs';
import assert from 'node:assert/strict';
const output='qa-output/closure';mkdirSync(output,{recursive:true});
function run(command,args){const r=spawnSync(command,args,{stdio:'inherit',env:process.env});assert.equal(r.status,0,command+' '+args.join(' '));}
run('npm',['ci','--ignore-scripts','--no-audit','--no-fund','--fetch-retries=0']);
if(!existsSync('/usr/bin/google-chrome'))run('npx',['playwright','install','--with-deps','chromium']);
run('npx',['vite','build','--config','qa/vite.qa.config.mjs']);
writeFileSync('qa/closure-tsconfig.json',JSON.stringify({compilerOptions:{target:'ES2022',module:'ESNext',moduleResolution:'bundler',skipLibCheck:true,strict:true,noEmit:true,jsx:'react-jsx',types:['node'],allowSyntheticDefaultImports:true},include:['../shared/**/*.ts','../src/**/*.tsx','../src/**/*.ts','../backend/**/*.ts','closure-sdk-contract.d.ts']},null,2));
run('npx',['tsc','-p','qa/closure-tsconfig.json']);
run('npx',['esbuild','backend/index.ts','--bundle','--platform=node','--format=esm','--packages=external','--outfile=qa-output/backend-candidate.mjs']);
const audit=spawnSync('npm',['audit','--omit=dev','--json'],{encoding:'utf8'});const report=JSON.parse(audit.stdout);writeFileSync(output+'/runtime-dependencies.json',JSON.stringify(report,null,2));assert(!report.error,'dependency audit unavailable');assert.equal(report.metadata.vulnerabilities.high,0);assert.equal(report.metadata.vulnerabilities.critical,0);
run('node',['qa/closure-preservation.mjs']);
if(process.env.ADMIN_PUBLICATION_CHECKS==='1'){
 run('node',['qa/admin-native-patch.mjs']);
 writeFileSync('backend/.admin-native-index.ts',readFileSync('qa-output/admin-publication/native-index.ts'));
 try{run('npx',['esbuild','backend/.admin-native-index.ts','--bundle','--platform=node','--format=esm','--packages=external','--outfile=qa-output/admin-publication/native-bundle.mjs']);}finally{unlinkSync('backend/.admin-native-index.ts');}
 run('npx',['esbuild','qa/admin-source-observer-entry.ts','--bundle','--platform=node','--format=esm','--outfile=qa-output/admin-publication/source-observer.mjs']);
 run('node',['qa/admin-source-observer.mjs']);
}
run('python',['qa/rc-pwa-check.py']);run('node',['qa/rc-restore-check.mjs']);
run('node',['qa/closure-capacity.mjs']);
// A failed live catalog read is a failure, never replaced by synthetic offers.
run('node',['qa/capture-real-public-feed.mjs']);
const server=spawn('npx',['vite','preview','--config','qa/vite.qa.config.mjs'],{stdio:'inherit',detached:true});
try{let ready=false;for(let i=0;i<40;i++){try{if((await fetch('http://127.0.0.1:4174/')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert(ready);run('node',['qa/closure-browser.mjs']);if(process.env.ADMIN_PUBLICATION_CHECKS==='1')run('node',['qa/admin-publication-browser.mjs']);run('node',['qa/ad-images-check.mjs','--commercial-only']);}
finally{try{process.kill(-server.pid,'SIGTERM');}catch{}}
writeFileSync(output+'/candidate.json',JSON.stringify({commit:process.env.GITHUB_SHA,checkedAt:new Date().toISOString(),deployed:false,productionWrites:0,realSdkWriteTested:false,physicalPushDeliveryTested:false,physicalInstallationTested:false,tests:['strict frontend/shared/backend TypeScript against reference-derived contract','Vite build with isolated SDK adapter','backend bundle','runtime dependency audit','PNG CRC/manifest','isolated recovery','local SQLite/HTTP concurrency','read-only real catalog','candidate browser with replayed real public content','commercial fixtures clearly isolated']},null,2));
console.log('CLOSURE_CANDIDATE_CHECKS_PASSED');
