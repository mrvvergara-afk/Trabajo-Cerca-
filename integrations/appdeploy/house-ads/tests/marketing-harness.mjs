import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const js=p=>stripTypeScriptTypes(read(p)).replace(/^import .*;$/gm,'');
export const shared=await import('data:text/javascript;base64,'+Buffer.from(js('shared/house-ads.ts')).toString('base64'));
export const policy=await import('data:text/javascript;base64,'+Buffer.from(js('shared/commercial-policy.ts')).toString('base64'));
export const NOW=Date.parse('2026-10-22T12:00:00Z');
export function setup({delay=0,cycle=false}={}){
 let tables=new Map();const writes=[];const reads=[];let fail=false;
 const table=(t,map=tables)=>{if(!map.has(t))map.set(t,new Map());return map.get(t);};
 const operation=(kind,t,rows,options={})=>({kind,t,rows,options,then(resolve,reject){try{resolve(apply(this,tables));}catch(e){reject(e);}}});
 const conflict=()=>Object.assign(Error('conflict'),{code:'AppDatabaseConditionFailed'});
 function apply(op,map){writes.push(op.kind);const dest=table(op.t,map);return op.rows.map(row=>{
   if(op.kind==='add'){if(dest.has(row.id))return null;dest.set(row.id,structuredClone(row));return row.id;}
   const old=dest.get(row.id);if(!old||Object.entries(row.if||{}).some(([k,v])=>old[k]!==v))return false;
   const patch=Object.fromEntries(Object.entries(row.record).map(([k,v])=>[k,v&&typeof v==='object'&&'inc'in v?(old[k]||0)+v.inc:v]));dest.set(row.id,{...old,...patch});return true;
 });}
 const db={get:async(t,ids)=>ids.map(id=>structuredClone(table(t).get(id)||null)),list:async(t,options={})=>{reads.push({table:t,...options});if(delay)await new Promise(r=>setTimeout(r,delay));const rows=[...table(t).values()];const offset=Number(options.nextToken)||0;const end=offset+(options.limit||100);return {items:rows.slice(offset,end).map(row=>structuredClone(row)),...(cycle?{nextToken:'100'}:end<rows.length?{nextToken:String(end)}:{})};},tx:{add:(t,rows)=>operation('add',t,rows),update:(t,rows,options)=>operation('update',t,rows,options)},transact:async ops=>{if(fail)throw conflict();const copy=structuredClone(tables);for(const op of ops){const r=apply(op,copy);if(r.some(v=>v===null||v===false))throw conflict();}tables=copy;}};
 const json=(value,statusCode=200)=>({statusCode,headers:{},body:JSON.stringify(value)});const storage={url:async paths=>paths.map(path=>({path,url:'https://example.org/signed'})),write:async()=>[true]};
 const exports=vm.runInNewContext('(function(){'+js('backend/house-marketing.ts').replace(/^export /gm,'')+';return {houseConfiguration,saveHouseConfiguration,advertisingCatalog,houseClientEvent,recordHouseEvent,houseDashboard,activateFreeTrial,uploadHouseCreative,commercialAdmin,commercialCampaigns,commercialConfiguration,publicPromotion,commercialInventory,invalidateCommercialInventory,commercialClientEvent,commercialMetrics};})()',{db,storage,json,error:(message,statusCode)=>json({error:message},statusCode),increment:n=>({inc:n}),isAppDatabaseError:e=>!!e?.code,createHash,randomUUID,Buffer,URL,console,structuredClone,...shared,...policy});
 return {...exports,table:(t)=>table(t),setFail:v=>{fail=v;},writes,reads};
}
export async function launch(b,extra={}){
 const current=await b.commercialConfiguration();const config={...current,launchAt:'2026-10-22T00:00:00Z',...extra};
 const response=await b.commercialAdmin({body:config,user:{userId:'isolated-admin'}});if(response.statusCode!==200)throw Error(response.body);return JSON.parse(response.body);
}
export function lead(b,id,name='Negocio '+id){b.table('growth_advertiser_leads').set(id,{id,businessName:name,category:'Comercio',commune:'Angol',advertisingConsent:true,houseAttribution:{campaignId:'house-professionals',creativeId:'a'}});return {body:{leadId:id,headline:'Contenido revisado',detail:'Solo ensayo aislado',url:'https://example.org'},user:{userId:'isolated-admin'}};}
