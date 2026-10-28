// The baseline is the unmodified published-source snapshot, not a fabricated expected result.
import {spawnSync} from 'node:child_process';
import {readdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve('../../../native-v99-baseline'),app=root+'/integrations/appdeploy/house-ads';
const commands=[
 {name:'baseline-node-repository',cwd:root,cmd:process.execPath,args:['--test',...readdirSync(root+'/tests').filter(x=>x.endsWith('.test.mjs')).map(x=>'tests/'+x)]},
 {name:'baseline-node-application',cwd:app,cmd:process.execPath,args:['--test',...readdirSync(app+'/tests').filter(x=>x.endsWith('.test.mjs')).map(x=>'tests/'+x)]},
 {name:'baseline-python',cwd:root,cmd:'python',args:['-m','unittest','discover','-s','tests','-p','test_*.py']}
];
const rows=[];
for(const run of commands){
 const result=spawnSync(run.cmd,run.args,{cwd:run.cwd,encoding:'utf8',timeout:180000,maxBuffer:30*1024*1024});
 const log=(result.stdout||'')+'\n'+(result.stderr||'');
 writeFileSync('qa-output/radar/'+run.name+'.log',log);
 rows.push({name:run.name,status:result.status,summary:log.split('\n').filter(x=>/ℹ (tests|pass|fail)|# (tests|pass|fail)|Ran \d+ tests|^OK$|FAILED/.test(x))});
}
writeFileSync('qa-output/radar/baseline-tests.json',JSON.stringify(rows,null,2));
console.log('RADAR_BASELINE_TESTS '+JSON.stringify(rows));
