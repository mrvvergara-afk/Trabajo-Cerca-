import {db, secrets} from '@appdeploy/sdk';
import {Buffer} from 'node:buffer';
import {directChatGPTImport} from './chatgpt-direct-import';
import {readPublicFeedPage} from './public-feed';

// Independent GitHub intake. Never reads Motor D's index or receipts.
const REPO='mrvvergara-afk/Trabajo-Cerca-';
const ROOT='automation/chatgpt_ready/';
const INDEX=ROOT+'index.json';
type Result={id:string;status:string;internalId?:string;existingId?:string;expectedWorkCommunes?:string[]};
type Receipt={id:string;batchId:string;status:string;results:Result[];newCount:number;published:number;at:string;checkedAt?:string};

async function load(path:string,token?:string){
  if(path!==INDEX&&!/^automation\/chatgpt_ready\/\d{8}\/chatgpt-\d{8}-[a-f0-9]{18}\.json$/.test(path))
    throw Error('unsafe_chatgpt_path');
  const response=await fetch('https://api.github.com/repos/'+REPO+'/contents/'+path+'?ref=main',{
    headers:{...(token?{authorization:'Bearer '+token}:{}),accept:'application/vnd.github+json',
      'x-github-api-version':'2022-11-28','user-agent':'TrabajoCerca-ChatGPT-Publisher'},
    signal:AbortSignal.timeout(9000)
  });
  if(response.status===404)return null;
  if(!response.ok)throw Error('chatgpt_github_http_'+response.status);
  const raw=await response.json() as {encoding?:string;content?:string;size?:number;sha?:string};
  if(raw.encoding!=='base64'||!raw.content||!raw.size||raw.size>180000||!raw.sha)
    throw Error('chatgpt_invalid_content');
  const bytes=Buffer.from(raw.content.replace(/\s/g,''),'base64');
  if(bytes.length!==raw.size)throw Error('chatgpt_size_mismatch');
  return {data:JSON.parse(bytes.toString('utf8')) as Record<string,unknown>,sha:raw.sha};
}
function result(state:string,extra:Record<string,unknown>={}){
  const row={at:new Date().toISOString(),state,...extra};
  console.warn('CHATGPT_BRIDGE '+JSON.stringify(row).slice(0,5000));
  return {statusCode:200,body:JSON.stringify(row)};
}
export async function chatgptAutoImportHandler(){
  try{
    const token=(await secrets.listSecretNames()).includes('MOTOR_C_GITHUB_READ_TOKEN')
      ?await secrets.readSecret('MOTOR_C_GITHUB_READ_TOKEN'):undefined;
    const head=await load(INDEX,token);
    if(!head)return result('awaiting_chatgpt_index');
    const idx=head.data;
    if(idx.schema_version!==1||idx.producer!=='chatgpt_territorial'||
       !Array.isArray(idx.batches)||idx.batches.length>256)return result('invalid_chatgpt_index');
    const now=Date.now(),failures='chatgpt_batch_recovery_v1';
    let processed=0,attempted=0,deferred=0;
    const invalidBatches:string[]=[];
    const invalidReferences:string[]=[];
    for(const entry of idx.batches as Array<Record<string,unknown>>){
      const batchId=String(entry?.batch_id||'');
      const rel=String(entry?.file||'');
      if(!/^chatgpt-\d{8}-[a-f0-9]{18}$/.test(batchId)||
         !/^\d{8}\/chatgpt-\d{8}-[a-f0-9]{18}\.json$/.test(rel)||
         !rel.endsWith('/'+batchId+'.json')||rel.slice(0,8)!==batchId.slice(8,16)){
        invalidReferences.push(batchId.slice(0,48));continue;
      }
      const [old]=await db.get<Receipt>('chatgpt_import_receipts',[batchId],{consistent:true});
      if(old?.results?.length){processed++;continue;}
      const [prior]=await db.get<{indexSha:string;attempt:number;nextAt:number|null}>(failures,[batchId],{consistent:true});
      const checkpoint=prior?.indexSha===head.sha?prior:null;
      if(checkpoint && (checkpoint.nextAt===null || checkpoint.nextAt>now)){deferred++;continue;}
      if(attempted>=4){deferred++;continue;}
      attempted++;
      let results:Result[];
      try{
        const file=await load(ROOT+rel,token);
        if(!file)throw Error('missing_chatgpt_batch');
        const batch=file.data;
        if(batch.schema_version!==1||batch.producer!=='chatgpt_territorial'||
           batch.approval!=='approved_for_publication'||batch.batch_id!==batchId||
           !Array.isArray(batch.offers)||!batch.offers.length||batch.offers.length>15)
          throw Error('unapproved_chatgpt_batch');
        const offers=batch.offers as Array<Record<string,unknown>>;
        if(offers.some(x=>typeof x?.id_fuente!=='string'||!/^cg_[a-f0-9]{20}$/.test(x.id_fuente)))
          throw Error('invalid_chatgpt_offer_ids');
        const output=await directChatGPTImport({offers,commit:true,producer:'chatgpt_territorial'});
        if(output.statusCode!==200)throw Error('chatgpt_import_http_'+output.statusCode);
        const parsed=JSON.parse(String(output.body||'{}')) as {results?:Result[]};
        results=parsed.results||[];
        const expected=new Set(offers.map(x=>String(x.id_fuente)));
        if(results.length!==offers.length||expected.size!==offers.length||
           new Set(results.map(x=>x.id)).size!==offers.length||results.some(x=>!expected.has(x.id)))
          throw Error('chatgpt_receipt_mismatch');
        const allowed=new Set(['direct_record_queued_for_public_projection','already_published',
          'already_imported_id','expired','review_expired','territory_reconciled']);
        if(results.some(x=>!allowed.has(x.status)))throw Error('chatgpt_unexpected_import_result');
      }catch(error){
        const reason=error instanceof Error?error.message.slice(0,100):'batch_unknown_error';
        if(/^chatgpt_github_http_(401|403|429)$/.test(reason))throw error;
        const attempt=(checkpoint?.attempt??0)+1;
        const terminal=attempt>=5||['unapproved_chatgpt_batch','invalid_chatgpt_offer_ids','chatgpt_import_http_400'].includes(reason);
        const [stored]=await db.tx.update(failures,[{id:batchId,record:{indexSha:head.sha,
          attempt,reason,state:terminal?'blocked':'retry',nextAt:terminal?null:now+15*60_000*2**(attempt-1)}}]);
        if(!stored)throw Error('chatgpt_batch_recovery_write_failed');
        invalidBatches.push(batchId);
        continue;
      }
      const newCount=results.filter(x=>x.status==='direct_record_queued_for_public_projection').length;
      const territoryReconciled=results.filter(x=>x.status==='territory_reconciled').length;
      const duplicates=results.filter(x=>['already_published','already_imported_id'].includes(x.status)).length;
      const expired=results.filter(x=>['expired','review_expired'].includes(x.status)).length;
      const receipt:Receipt={id:batchId,batchId,status:newCount||territoryReconciled?'awaiting_public_feed':'processed_without_new_publications',
        results,newCount,published:0,at:new Date().toISOString()};
      try{
        const [saved]=await db.tx.add('chatgpt_import_receipts',[receipt]);
        if(!saved)throw Error('chatgpt_receipt_write_unconfirmed');
      }catch(cause){
        const [again]=await db.get<Receipt>('chatgpt_import_receipts',[batchId],{consistent:true});
        if(!again?.results?.length)throw cause;
      }
      return result('chatgpt_imported_waiting_for_feed',{batchId,newCount,duplicates,territoryReconciled,expired,deferred,invalidBatches,invalidReferenceCount:invalidReferences.length});
    }
    const latestBatch = (idx.batches as Array<Record<string,unknown>>)
      .map(entry => String(entry?.batch_id || ''))
      .sort()
      .at(-1) || '';
    const latestBatchDate = /^chatgpt-\d{8}-[a-f0-9]{18}$/.test(latestBatch)
      ? latestBatch.slice(8,12) + '-' + latestBatch.slice(12,14) + '-' + latestBatch.slice(14,16)
      : null;
    const lastBatchAgeHours = latestBatchDate
      ? Math.max(0, Math.floor((Date.now() - Date.parse(latestBatchDate + 'T23:59:59-03:00')) / 3600000))
      : null;
    if(invalidBatches.length||deferred) return result('chatgpt_batch_recovery_pending',{processed,attempted,deferred,invalidBatches,latestBatchDate,lastBatchAgeHours});
    if(invalidReferences.length) return result('invalid_chatgpt_references',{
      indexedBatches:idx.batches.length,processed,invalidReferenceCount:invalidReferences.length,latestBatchDate,lastBatchAgeHours
    });
    const producerStale = lastBatchAgeHours === null || lastBatchAgeHours >= 24;
    return result(producerStale ? 'producer_stale_no_new_batches' : 'no_unprocessed_chatgpt_batches', {
      indexedBatches:idx.batches.length,
      processed,
      latestBatchDate,
      lastBatchAgeHours,
      producerStale,
      actionRequired:producerStale ? 'check_scheduled_chatgpt_producer' : null,
    });
  }catch(cause){
    return result('chatgpt_bridge_error',{error:String(cause).slice(0,180)});
  }
}
export async function confirmChatGPTPublications(){
  try{
    const pending:Receipt[]=[];
    let token:string|undefined;
    const receiptCursors=new Set<string>();
    let receiptsComplete=false;
    for(let n=0;n<100;n++){
      const page=await db.list<Receipt>('chatgpt_import_receipts',{limit:100,...(token?{nextToken:token}:{})});
      pending.push(...page.items.filter(x=>x.status==='awaiting_public_feed'&&x.newCount>0));
      if(!page.nextToken){receiptsComplete=true;break;}
      if(receiptCursors.has(page.nextToken))break;
      receiptCursors.add(page.nextToken);token=page.nextToken;
    }
    if(!receiptsComplete)return {status:'receipts_incomplete',checked:0,published:0};
    if(!pending.length)return {status:'idle',checked:0,published:0};
    const ids=new Set<string>();
    const workById=new Map<string,string[]>();
    let cursor:string|undefined,complete=false,total=0;
    const seen=new Set<string>();
    for(let n=0;n<100;n++){
      const page=await readPublicFeedPage(cursor);
      if(!page||('feedRebuilding' in page && page.feedRebuilding===true)||('degraded' in page && page.degraded===true))return {status:'feed_unavailable',checked:0,published:0};
      if(!Array.isArray(page.items))return {status:'feed_invalid_items',checked:0,published:0};
      total+=page.items.length;
      for(const item of page.items){
        if(item.verified!==true)continue;
        const id=String(item.id);ids.add(id);
        workById.set(id,Array.isArray(item.workCommunes)?item.workCommunes as string[]:[]);
      }
      if(!page.nextCursor){complete=total>=Number(page.totalJobOffers||0);break;}
      if(seen.has(page.nextCursor))break;
      seen.add(page.nextCursor);cursor=page.nextCursor;
    }
    if(!complete)return {status:'feed_incomplete',checked:0,published:0};
    let published=0,newVisible=0,territorialCorrectionsVisible=0;
    for(const receipt of pending.slice(0,12)){
      const newer=receipt.results.filter(x=>x.status==='direct_record_queued_for_public_projection'||x.status==='territory_reconciled');
      const confirmed=newer.filter(x=>{
        const key=x.internalId||('chatgpt_'+x.id);
        if(!ids.has(key))return false;
        if(!x.expectedWorkCommunes?.length)return true;
        const sites=workById.get(key)||[];
        return x.expectedWorkCommunes.every(site=>sites.includes(site));
      });
      const count=confirmed.length;
      const newlyVisible=confirmed.filter(x=>x.status==='direct_record_queued_for_public_projection').length;
      const correctionsVisible=count-newlyVisible;
      await db.tx.update('chatgpt_import_receipts',[{id:receipt.id,record:{
        ...receipt,published:count,newlyVisible,correctionsVisible,status:count===newer.length?'published':'awaiting_public_feed',
        checkedAt:new Date().toISOString()
      }}]);
      published+=count;newVisible+=newlyVisible;territorialCorrectionsVisible+=correctionsVisible;
    }
    return {status:'checked',checked:Math.min(12,pending.length),published,newVisible,territorialCorrectionsVisible};
  }catch(cause){return {status:'confirmation_error',error:String(cause).slice(0,180),checked:0,published:0};}
}
