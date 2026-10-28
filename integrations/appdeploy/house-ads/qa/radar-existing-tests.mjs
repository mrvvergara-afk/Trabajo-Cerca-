import {spawnSync} from 'node:child_process';
import {readdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve('../../..');
const runs=[
 {name:'node-repository',cwd:root,cmd:process.execPath,args:['--test',...readdirSync(root+'/tests').filter(x=>x.endsWith('.test.mjs')).map(x=>'tests/'+x)]},
 {name:'node-application',cwd:process.cwd(),cmd:process.execPath,args:['--test',...readdirSync('tests').filter(x=>x.endsWith('.test.mjs')).map(x=>'tests/'+x)]},
 {name:'python-repository',cwd:root,cmd:'python',args:['-m','unittest','discover','-s','tests','-p','test_*.py']}
];
const report=[];
for(const run of runs){
 const proc=spawnSync(run.cmd,run.args,{cwd:run.cwd,encoding:'utf8',timeout:180000,maxBuffer:30*1024*1024});
 const log=(proc.stdout||'')+'\n'+(proc.stderr||'');
 writeFileSync('qa-output/radar/'+run.name+'.log',log);
 const summary=log.split('\n').filter(x=>/# (tests|pass|fail)|ℹ (tests|pass|fail)|Ran \d+ tests|^OK$|FAILED/.test(x));
 report.push({name:run.name,files:run.name.startsWith('node')?run.args.length-1:undefined,status:proc.status,signal:proc.signal,error:proc.error?.message,summary});
 if(proc.status!==0)console.log(log.split('\n').filter(x=>/not ok|✖|Error|Assertion|^FAIL|^ERROR|^  File/.test(x)).slice(0,35).join('\n'));
}
writeFileSync('qa-output/radar/existing-tests.json',JSON.stringify(report,null,2));
console.log('RADAR_EXISTING_TESTS '+JSON.stringify(report));
if(report.some(x=>x.status!==0))process.exitCode=1;
