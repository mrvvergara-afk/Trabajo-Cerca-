import {performance} from 'node:perf_hooks';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {setup} from '../tests/marketing-harness.mjs';
const reports=[];
for(const count of [0,20,100,500,1000,5000]){
 const b=setup({delay:1});
 for(let i=0;i<count;i++)b.table('growth_campaigns').set('capacity-'+i,{id:'capacity-'+i,businessName:'Ensayo '+i,headline:'Anuncio sintético aislado '+i,detail:'Solo en memoria: no se publica ni se carga a AppDeploy.',communes:[i===count-1?'Negrete':'Angol'],category:'Comercio',status:'active',startAt:'2000-01-01T00:00:00Z',endAt:'2099-01-01T00:00:00Z',priority:0,placements:['search','listing'],adType:'COMMERCIAL_FREE'});
 const before=process.memoryUsage();const cpu=process.cpuUsage();const begin=performance.now();
 const cold=await b.advertisingCatalog({place:'Negrete',turn:'0'});const coldMs=performance.now()-begin;
 assert(cold.commercial.length<=2);if(count)assert.equal(cold.commercial[0].id,'capacity-'+(count-1));
 const latency=[];let maximumPayload=0;
 for(const concurrency of [1,5,20]){
  const start=performance.now();await Promise.all(Array.from({length:concurrency},async(_,turn)=>{const t=performance.now();const result=await b.advertisingCatalog({place:'Angol',turn:String(turn)});latency.push(performance.now()-t);maximumPayload=Math.max(maximumPayload,Buffer.byteLength(JSON.stringify(result)));assert(result.commercial.length<=2);}));
  assert(performance.now()-start<15000,'local_model_budget');
 }
 latency.sort((a,b)=>a-b);const used=process.cpuUsage(cpu);const after=process.memoryUsage();
 assert(maximumPayload<20000,'browser_catalog_not_bounded');
 const readPages=b.reads.filter(r=>r.table==='growth_campaigns').length;assert.equal(readPages,Math.max(1,Math.ceil(count/100)));
 b.invalidateCommercialInventory();const n=b.reads.length;
 await Promise.all(Array.from({length:20},()=>b.advertisingCatalog({place:'Angol'})));
 const singleFlightReads=b.reads.slice(n).filter(r=>r.table==='growth_campaigns').length;
 assert.equal(singleFlightReads,Math.max(1,Math.ceil(count/100)));
 reports.push({records:count,coldMs:+coldMs.toFixed(3),warmP50Ms:+latency[Math.floor(latency.length*.5)].toFixed(3),warmP95Ms:+latency[Math.floor(latency.length*.95)].toFixed(3),readPages,maxBrowserBytes:maximumPayload,heapDeltaBytes:after.heapUsed-before.heapUsed,rssBytes:after.rss,cpuMs:(used.user+used.system)/1000,concurrency:[1,5,20],singleFlightReads,errors:0});
}
const report={checkedAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,adapter:'in-memory paginated SDK model; simulated 1 ms per list call',network:false,productionWrites:0},rows:reports,limitations:['No mide latencia ni cuotas reales de AppDeploy.','Concurrencia de hasta 20 promesas en un proceso; no son 20 instancias distribuidas.','No mide capacidad total de almacenamiento, fotos, tráfico real o facturación.','Caché local 30 s; instancias distintas repiten lecturas.','Escaneo completo por SDK: filtros posteriores a lectura no equivalen a índices.','Presupuestos de protección: 200 páginas de 100 y 8 MiB proyectados; al superarlos falla explícitamente, sin ocultar anunciantes.']};
mkdirSync('qa-output',{recursive:true});writeFileSync('qa-output/commercial-capacity.json',JSON.stringify(report,null,2));console.log('COMMERCIAL_CAPACITY_PROOF '+JSON.stringify(report));
