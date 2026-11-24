import {registerHooks} from 'node:module';

export function memoryDatabase(){
 const tables=new Map();
 let id=0;
 let failAfterCommit=false;
 const map=(name,target=tables)=>{
  if(!target.has(name))target.set(name,new Map());
  return target.get(name);
 };
 const failure=code=>Object.assign(Error(code),{code});
 const write=(operation,target,atomic)=>{
  const rows=map(operation.table,target);
  return operation.items.map(item=>{
   const key=operation.kind==='delete'?item:item.id??String(++id);
   const previous=rows.get(key);
   if(operation.kind==='add'){
    if(previous){if(atomic)throw failure('AppDatabaseDuplicateId');return null;}
    rows.set(key,structuredClone({...item,id:key}));return key;
   }
   if(operation.kind==='delete'){rows.delete(key);return true;}
   if(item.if && (!previous || Object.entries(item.if).some(([field,value])=>previous[field]!==value))){
    if(atomic)throw failure('AppDatabaseConditionFailed');return false;
   }
   rows.set(key,structuredClone({...operation.options?.patch?previous:{},...item.record,id:key}));
   return true;
  });
 };
 const lazy=kind=>(table,items,options)=>{
  const operation={kind,table,items,options};
  let pending;
  const consume=()=>pending??=Promise.resolve().then(()=>write(operation,tables,false));
  return {operation,then:(ok,bad)=>consume().then(ok,bad),catch:bad=>consume().catch(bad)};
 };
 const tx={add:lazy('add'),update:lazy('update'),delete:lazy('delete')};
 const db={
  tx,
  async transact(handles){
   const staged=structuredClone(tables);
   const result=handles.map(handle=>write(handle.operation,staged,true));
   tables.clear();
   for(const [key,value] of staged)tables.set(key,value);
   if(failAfterCommit){failAfterCommit=false;throw failure('AppDatabaseUnknownOutcome');}
   return result;
  },
  async get(name,ids){return ids.map(key=>structuredClone(map(name).get(key)??null));},
  async list(name,{limit=100,nextToken}={}){
   const entries=[...map(name).values()],start=nextToken?Number(nextToken):0;
   return {items:structuredClone(entries.slice(start,start+limit)),nextToken:start+limit<entries.length?String(start+limit):undefined};
  },
  async add(name,items){return tx.add(name,items.map(item=>({...item,id:String(++id)})));},
  async delete(name,ids){return tx.delete(name,ids);},
  async update(name,items){return tx.update(name,items);},
 };
 return {db,tables,failNextCommitResponse(){failAfterCommit=true;}};
}

export function hookSdk(memory){
 globalThis.testAppDeploy={db:memory.db,isAppDatabaseError:e=>Boolean(e?.code)};
 const mock='data:text/javascript,'+encodeURIComponent('export const {db,isAppDatabaseError}=globalThis.testAppDeploy;');
 return registerHooks({resolve(specifier,context,next){
  if(specifier==='@appdeploy/sdk')return {url:mock,shortCircuit:true};
  if(context.parentURL?.endsWith('.ts')&&specifier.startsWith('.')&&!specifier.endsWith('.ts'))
   return next(specifier+'.ts',context);
  return next(specifier,context);
 }});
}
