// Audit-only: native feed controller with local SQLite, no AppDeploy calls.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {createServer} from 'node:http';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
const database=new DatabaseSync(':memory:');
database.exec('CREATE TABLE records (table_name TEXT, id TEXT, data TEXT, PRIMARY KEY(table_name,id))');
const insert=database.prepare('INSERT INTO records VALUES (?,?,?)');
const get=database.prepare('SELECT data FROM records WHERE table_name=? AND id=?');
const first=database.prepare('SELECT data FROM records WHERE table_name=? LIMIT 1');
const put=(table,id,data)=>insert.run(table,id,JSON.stringify({...data,id}));
const items=Array.from({length:260},(_,i)=>({id:'isolated-'+i,kind:'job_offer',title:'Ensayo aislado '+i,workCommunes:['Angol'],firstPublishedAt:'2026-10-24T00:00:00Z'}));
const pages=[];
for(let i=0;i<items.length;i+=40){const id='leaf-'+i;pages.push({id});put('public_feed_versions',id,{entries:items.slice(i,i+40).map(item=>({sourceId:item.id,item}))});}
put('public_feed_control','control',{manifestId:'isolated-manifest'});
put('public_feed_manifests','isolated-manifest',{schema:2,pages,itemCount:260,published:260});
let reads=0;
const db={get:async(table,ids)=>{reads+=ids.length;return ids.map(id=>get.get(table,id)).filter(Boolean).map(row=>JSON.parse(row.data));}};
const single=async table=>{reads++;const row=first.get(table);return row?JSON.parse(row.data):null;};
const source=readFileSync(new URL('../backend/public-feed.ts',import.meta.url),'utf8');
const start=source.indexOf('export async function readPublicFeedPage('),end=source.indexOf('\n}',start)+2;
const fn=vm.runInNewContext('('+stripTypeScriptTypes(source.slice(start,end).replace(/^export /,''),{mode:'strip'})+')',{single,db,PAGE_SIZE:40,Number,Error});
let cursor,all=[];do{const page=await fn(cursor);all.push(...page.items);cursor=page.nextCursor;}while(cursor);
assert.equal(all.length,260);assert.equal(new Set(all.map(x=>x.id)).size,260);
await assert.rejects(()=>fn('v2:bad:1000001'));
const server=createServer(async(req,res)=>{try{const data=await fn(new URL(req.url,'http://localhost').searchParams.get('cursor')||undefined);res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(data));}catch{res.writeHead(400);res.end();}});
try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});}
catch(error){const report={executedAt:new Date().toISOString(),sourceSnapshot:process.env.GITHUB_SHA||'candidate',syntheticRecords:260,completePagination:true,uniqueItems:all.length,invalidCursorRejected:true,concurrencyTestsExecuted:false,reason:error.code+': '+error.message,appdeployCapacity:'Not measured',productionWrites:0,externalRequests:0};writeFileSync('qa-output/closure/capacity.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));database.close();process.exit(0);}
const url='http://127.0.0.1:'+server.address().port;
const output={sourceSnapshot:process.env.GITHUB_SHA||'candidate',scope:'Local loopback HTTP + SQLite in memory + native readPublicFeedPage. NOT AppDeploy capacity or human users.',syntheticRecords:260,completePagination:true,externalRequests:0,productionWrites:0,scenarios:[]};
for(const concurrency of [10,50,100]){
 const latencies=[],initialReads=reads,rssBefore=process.memoryUsage().rss;let errors=0;const t=performance.now();
 await Promise.all(Array.from({length:concurrency},async(_,worker)=>{for(let j=0;j<3;j++){const started=performance.now();try{const response=await fetch(url+'/?cursor='+encodeURIComponent('v2:isolated-manifest:'+((worker+j)%pages.length)));const body=await response.json();if(!response.ok||body.totalItems!==260||!body.items.length)errors++;}catch{errors++;}latencies.push(performance.now()-started);}}));
 latencies.sort((a,b)=>a-b);const percentile=p=>Number(latencies[Math.min(latencies.length-1,Math.ceil(p*latencies.length)-1)].toFixed(2));
 output.scenarios.push({concurrentHttpClients:concurrency,requests:latencies.length,errors,p50ms:percentile(.5),p95ms:percentile(.95),maxms:percentile(1),elapsedMs:Number((performance.now()-t).toFixed(2)),sqliteReads:reads-initialReads,rssBeforeBytes:rssBefore,rssAfterBytes:process.memoryUsage().rss});
}
await new Promise(resolve=>server.close(resolve));database.close();
output.executedAt=new Date().toISOString();writeFileSync('qa-output/closure/capacity.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
