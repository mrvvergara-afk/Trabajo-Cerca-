import {db, secrets} from '@appdeploy/sdk';
import {Buffer} from 'node:buffer';
import {directChatGPTImport} from './chatgpt-direct-import';
import {readPublicFeedPage} from './public-feed';

// Independent GitHub intake. Never reads Motor D's index or receipts.
const REPO='mrvvergara-afk/Trabajo-Cerca-';
const ROOT='automation/chatgpt_ready/';
const INDEX=ROOT+'index.json';
type Result={id:string;status:string;internalId?:string;existingId?:string};
type Receipt={id:string;batchId:string;status:string;results:Result[];newCount:number;published:number;at:string;checkedAt?:string};

async function load(path:string,token:string){
  if(path!==INDEX&&!/^automation\/chatgpt_ready\/\d{8}\/chatgpt-\d{8}-[a-f0-9]{18}\.json$/.test(path))
    throw Error('unsafe_chatgpt_path');
  const response=await fetch('https://api.github.com/repos/'+REPO+'/contents/'+path+'?ref=main',{
    headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json',
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
    if(!(await secrets.listSecretNames()).includes('MOTOR_C_GITHUB_READ_TOKEN'))
      return result('awaiting_github_read_token');
    const token=await secrets.readSecret('MOTOR_C_GITHUB_READ_TOKEN');
    const head=await load(INDEX,token);
    if(!head)return result('awaiting_chatgpt_index');
    const idx=head.data;
    if(idx.schema_version!==1||idx.producer!=='chatgpt_territorial'||
       !Array.isArray(idx.batches)||idx.batches.length>256)return result('invalid_chatgpt_index');
    let processed=0;
    for(const entry of idx.batches as Array<Record<string,unknown>>){
      const batchId=String(entry.batch_id||'');
      const rel=String(entry.file||'');
      if(!/^chatgpt-\d{8}-[a-f0-9]{18}$/.test(batchId)||
         !/^\d{8}\/chatgpt-\d{8}-[a-f0-9]{18}\.json$/.test(rel)||
         !rel.endsWith('/'+batchId+'.json'))return result('invalid_chatgpt_reference',{batchId});
      const [old]=await db.get<Receipt>('chatgpt_import_receipts',[batchId],{consistent:true});
      if(old?.results?.length){processed++;continue;}
      const file=await load(ROOT+rel,token);
      if(!file)return result('missing_chatgpt_batch',{batchId});
      const batch=file.data;
      if(batch.schema_version!==1||batch.producer!=='chatgpt_territorial'||
         batch.approval!=='approved_for_publication'||batch.batch_id!==batchId||
         !Array.isArray(batch.offers)||!batch.offers.length||batch.offers.length>15)
        return result('unapproved_chatgpt_batch',{batchId});
      const offers=batch.offers as Array<Record<string,unknown>>;
      if(offers.some(x=>typeof x.id_fuente!=='string'||!/^cg_[a-f0-9]{20}$/.test(x.id_fuente)))
        return result('invalid_chatgpt_offer_ids',{batchId});
      const output=await directChatGPTImport({offers,commit:true,producer:'chatgpt_territorial'});
      if(output.statusCode!==200)return result('chatgpt_import_error',{batchId,http:output.statusCode});
      const parsed=JSON.parse(String(output.body||'{}')) as {results?:Result[]};
      const results=parsed.results||[];
      const expected=new Set(offers.map(x=>String(x.id_fuente)));
      if(results.length!==offers.length||expected.size!==offers.length||
         new Set(results.map(x=>x.id)).size!==offers.length||results.some(x=>!expected.has(x.id)))
        return result('chatgpt_receipt_mismatch',{batchId});
      const allowed=new Set(['direct_record_queued_for_public_projection','already_published',
        'already_imported_id','expired','review_expired']);
      if(results.some(x=>!allowed.has(x.status)))return result('chatgpt_unexpected_import_result',{batchId});
      const newCount=results.filter(x=>x.status==='direct_record_queued_for_public_projection').length;
      const receipt:Receipt={id:batchId,batchId,status:newCount?'awaiting_public_feed':'processed_without_new_publications',
        results,newCount,published:0,at:new Date().toISOString()};
      try{
        const [saved]=await db.tx.add('chatgpt_import_receipts',[receipt]);
        if(!saved)throw Error('chatgpt_receipt_write_unconfirmed');
      }catch(cause){
        const [again]=await db.get<Receipt>('chatgpt_import_receipts',[batchId],{consistent:true});
        if(!again?.results?.length)throw cause;
      }
      return result('chatgpt_imported_waiting_for_feed',{batchId,newCount,duplicates:results.length-newCount});
    }
    return result('no_unprocessed_chatgpt_batches',{indexedBatches:idx.batches.length,processed});
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
    let cursor:string|undefined,complete=false,total=0;
    const seen=new Set<string>();
    for(let n=0;n<100;n++){
      const page=await readPublicFeedPage(cursor);
      if(!page||('feedRebuilding' in page && page.feedRebuilding===true)||('degraded' in page && page.degraded===true))return {status:'feed_unavailable',checked:0,published:0};
      if(!Array.isArray(page.items))return {status:'feed_invalid_items',checked:0,published:0};
      total+=page.items.length;
      for(const item of page.items)ids.add(String(item.id));
      if(!page.nextCursor){complete=total>=Number(page.totalJobOffers||0);break;}
      if(seen.has(page.nextCursor))break;
      seen.add(page.nextCursor);cursor=page.nextCursor;
    }
    if(!complete)return {status:'feed_incomplete',checked:0,published:0};
    let published=0;
    for(const receipt of pending.slice(0,12)){
      const newer=receipt.results.filter(x=>x.status==='direct_record_queued_for_public_projection');
      const count=newer.filter(x=>ids.has(x.internalId||('chatgpt_'+x.id))).length;
      await db.tx.update('chatgpt_import_receipts',[{id:receipt.id,record:{
        ...receipt,published:count,status:count===newer.length?'published':'awaiting_public_feed',
        checkedAt:new Date().toISOString()
      }}]);
      published+=count;
    }
    return {status:'checked',checked:Math.min(12,pending.length),published};
  }catch(cause){return {status:'confirmation_error',error:String(cause).slice(0,180),checked:0,published:0};}
}
