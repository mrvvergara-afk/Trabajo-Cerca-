const ids=['A','B','C','D','CHATGPT','GEMINI'];
const now=new Date().toISOString();
const fixture={
 schemaVersion:1,readOnly:true,generatedAt:now,historyComplete:false,
 engines:ids.map(id=>({id,role:['B','C'].includes(id)?'documents':'discovery',
  status:{C:'error',D:'stale',CHATGPT:'unreported'}[id]??'recent',
  observedAt:id==='CHATGPT'?null:now,counts:{processed:id==='B'?0:null,attempted:id==='A'?0:id==='GEMINI'?30:null,publishedConfirmed:null},notes:[],
  source:['B','C'].includes(id)?'bc_stage_execution_receipts_v1':'fixture'})),
 stageRead:['B','C'].map(engine=>({engine,latest:{runId:'qa-'+engine,at:now,
  status:engine==='B'?'completed':'failed',health:engine==='B'?'recent':'error',
  processed:engine==='B'?0:null,inputCount:engine==='B'?0:null,error:engine==='C'?'Lectura fallida':null},sampledRuns:1,complete:true})),
 rollup:{recent:3,reporting:4,total:6},missingOrFailed:['C','CHATGPT'],history:[
  {engine:'B',day:'2026-11-25',measure:'docs_processed',value:0},
  {engine:'B',day:'2026-11-26',measure:'docs_processed',value:2},
  {engine:'B',day:'2026-11-27',measure:'docs_processed',value:4},
  {engine:'C',day:'2026-11-26',measure:'docs_processed',value:3},
  {engine:'C',day:'2026-11-27',measure:'docs_processed',value:6},
  {engine:'C',day:'2026-11-27',measure:'links_detected',value:82},
 ],
 operationReadState:'available',operation:{visible:1,observedBuckets:1,
  motors:Object.fromEntries(ids.map(id=>[id,id==='A'?1:0])),
  latency:{p50:{upperMinutes:5,samples:1},p95:null,p99:null}},
};
const get=async path=>{
 if(path==='/api/admin/ops-telemetry')return {data:fixture};
 if(path.startsWith('/api/admin/'))return {data:{readOnly:true,communes:[],sources:[]}};
 if(path.startsWith('/api/listings'))return {data:{items:[],hasMore:false,totalItems:0,totalVerifiedJobOffers:0}};
 return {data:{}};
};
export const api={get,post:async()=>({data:{}}),put:async()=>({data:{}}),delete:async()=>({data:{}})};
const offline=()=>Promise.resolve(null);
export const auth=new Proxy({}, {get:()=>offline});
export const notifications=new Proxy({}, {get:()=>offline});
export const image=new Proxy({}, {get:()=>offline});
