const ids=['A','B','C','D','CHATGPT','GEMINI'];
const now=new Date().toISOString();
const fixture={
 schemaVersion:1,readOnly:true,generatedAt:now,historyComplete:false,
 engines:ids.map(id=>({id,role:'discovery',status:'unreported',observedAt:null,counts:{},notes:[]})),
 rollup:{recent:0,reporting:0,total:6},missingOrFailed:ids,history:[],
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
