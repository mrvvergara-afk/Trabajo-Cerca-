import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const read=p=>readFileSync(p,'utf8');const hash=x=>createHash('sha256').update(x).digest('hex');
const baseline=JSON.parse(read('qa/collector-baseline.json')),source=read('backend/index.ts');
const declarations=[...source.matchAll(/^export const (\w+)\s*=/gm)];
for(const [name,digest] of Object.entries(baseline.handlers)){
 const i=declarations.findIndex(x=>x[1]===name);assert(i>=0);assert.equal(hash(source.slice(declarations[i].index,declarations[i+1]?.index??source.length).trim()),digest,'scheduled_handler_changed '+name);
}
assert.deepEqual(JSON.parse(read('cron.json')),baseline.cron);
const lock=JSON.parse(read('package-lock.json'));assert(lock.lockfileVersion>=3);copyFileSync('package-lock.json','qa-output/package-lock.json');
const result=spawnSync('npm',['audit','--omit=dev','--json'],{encoding:'utf8'});let audit;
try{audit=JSON.parse(result.stdout);}catch{throw Error('runtime_dependency_audit_unavailable');}
if(audit.error)throw Error('runtime_dependency_audit_failed');
writeFileSync('qa-output/runtime-dependency-audit.json',JSON.stringify(audit,null,2));
assert.equal(audit.metadata?.vulnerabilities?.high??0,0,'runtime_high_vulnerability');assert.equal(audit.metadata?.vulnerabilities?.critical??0,0,'runtime_critical_vulnerability');
const py=spawnSync('python',['qa/rc-pwa-check.py'],{stdio:'inherit'});assert.equal(py.status,0,'PWA asset validation');
const recovery=spawnSync('node',['qa/rc-restore-check.mjs'],{stdio:'inherit',env:process.env});assert.equal(recovery.status,0,'isolated restore validation');
const report={checkedAt:new Date().toISOString(),deployed:false,scheduledHandlersUnchanged:Object.keys(baseline.handlers),cronCount:baseline.cron.length,cronSchedulesUnchanged:true,fullBackendBundleBytes:readFileSync('qa-output/backend-candidate.mjs').length,backendBundleSha256:hash(readFileSync('qa-output/backend-candidate.mjs')),lockSha256:hash(read('package-lock.json')),runtimeVulnerabilities:audit.metadata.vulnerabilities,realSdkMutationTested:false,capacity5000ReRun:false};
writeFileSync('qa-output/rc-local.json',JSON.stringify(report,null,2));console.log('RC_LOCAL_PROOF '+JSON.stringify(report));
