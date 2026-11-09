import { db, secrets } from '@appdeploy/sdk';
import { Buffer } from 'node:buffer';
import { directChatGPTImport } from './chatgpt-direct-import';
import { readPublicFeedPage } from './public-feed';
import { publicFeedIdentity } from './public-source-adapters';

// This file is a source review snapshot for the AppDeploy deployment.
// The production module lives at backend/motor-d-auto-import.ts.
const REPO = 'mrvvergara-afk/Trabajo-Cerca-';
const INDEX = 'automation/motor_d_ready/index.json';
type Result = { id:string; status:string; internalId?:string; existingId?:string };
type Receipt = { id:string; batchId?:string; status?:string; results?:Result[]; accepted?:number; published?:number; known?:number; checkedAt?:string };

async function load(path:string, token:string) {
  if (!/^automation\/motor_d_ready\/(?:index\.json|\d{8}\/motor-d-\d{8}-[a-f0-9]{18}\.json)$/.test(path)) throw Error('invalid_d_path');
  const response=await fetch('https://api.github.com/repos/'+REPO+'/contents/'+path+'?ref=main',{
    headers:{ authorization:'Bearer '+token,accept:'application/vnd.github+json',
      'x-github-api-version':'2022-11-28','user-agent':'TrabajoCerca-D-Publisher' },
    signal:AbortSignal.timeout(9000)
  });
  if (response.status===404)return null;
  if (!response.ok)throw Error('github_http_'+response.status);
  const raw=await response.json() as {encoding?:string;content?:string;size?:number;sha?:string};
  if(raw.encoding!=='base64'||typeof raw.content!=='string'||typeof raw.size!=='number'||raw.size>180000||!raw.sha)throw Error('invalid_github_content');
  const buffer=Buffer.from(raw.content.replace(/\s/g,''),'base64');
  if(buffer.length!==raw.size)throw Error('github_size_mismatch');
  return { data:JSON.parse(buffer.toString('utf8')) as Record<string,unknown>,sha:raw.sha };
}

async function recordStatus(state:string,more:Record<string,unknown>={}) {
  const row={at:new Date().toISOString(),state,...more};
  await db.tx.update('motor_d_bridge_status',[{id:'current',record:row}]);
  console.warn('MOTOR_D_BRIDGE '+JSON.stringify(row).slice(0,8000));
  return {statusCode:200,body:JSON.stringify(row)};
}

export async function motorDAutoImportHandler(){
  try{
    const names=await secrets.listSecretNames();
    if(!names.includes('MOTOR_C_GITHUB_READ_TOKEN'))return recordStatus('awaiting_read_token');
    const token=await secrets.readSecret('MOTOR_C_GITHUB_READ_TOKEN');
    const source=await load(INDEX,token);
    if(!source)return recordStatus('awaiting_first_express_batch');
    const batches=source.data.batches;
    if(source.data.schema_version!==1||!Array.isArray(batches)||batches.length>256)return recordStatus('invalid_index');
    for(const entry of batches as Array<Record<string,unknown>>){
      const batchId=String(entry.batch_id||''),relative=String(entry.file||'');
      if(!/^motor-d-\d{8}-[a-f0-9]{18}$/.test(batchId)||
         !/^\d{8}\/motor-d-\d{8}-[a-f0-9]{18}\.json$/.test(relative)||
         !relative.endsWith('/'+batchId+'.json'))return recordStatus('invalid_batch_reference',{batchId});
      const [old]=await db.get<Receipt>('motor_d_import_receipts',[batchId],{consistent:true});
      if(old?.results?.length)continue;
      const file=await load('automation/motor_d_ready/'+relative,token);
      if(!file)return recordStatus('batch_missing',{batchId});
      const data=file.data;
      if(data.schema_version!==1||data.approval!=='approved_for_publication'||
         data.producer!=='motor_d_territorial'||data.batch_id!==batchId||
         !Array.isArray(data.offers)||data.offers.length<1||data.offers.length>15)return recordStatus('unapproved_batch',{batchId});
      const offers=data.offers as Array<Record<string,unknown>>;
      const expired:Result[]=[];
      const current:Record<string,unknown>[]=[];
      for(const offer of offers){
        const ocr=Boolean(offer.review_id||offer.promotion_id||offer.ocr_revalidate_after);
        if(ocr && (typeof offer.review_id!=='string'||typeof offer.promotion_id!=='string'||
            typeof offer.ocr_revalidate_after!=='string'||!Number.isFinite(Date.parse(offer.ocr_revalidate_after))))
          return recordStatus('invalid_ocr_authorization',{batchId});
        if(ocr && Date.parse(String(offer.ocr_revalidate_after))<=Date.now())
          expired.push({id:String(offer.id_fuente),status:'review_expired'});
        else current.push(offer);
      }
      const output=current.length ? await directChatGPTImport({offers:current,commit:true}) :
        {statusCode:200,body:'{"results":[]}'};
      if(output.statusCode!==200)return recordStatus('import_error',{batchId,http:output.statusCode});
      const parsed=JSON.parse(String(output.body||'{}')) as {results?:Result[]};
      const results=[...(parsed.results||[]),...expired];
      if(results.length!==data.offers.length)return recordStatus('partial_batch',{batchId,got:results.length,expected:data.offers.length});
      const allowed=new Set(['direct_record_queued_for_public_projection','already_published','already_imported_id','expired','review_expired']);
      if(results.some(x=>!allowed.has(x.status)))return recordStatus('invalid_results',{batchId});
      const accepted=results.filter(x=>!['expired','review_expired'].includes(x.status)).length;
      const known=results.length-accepted;
      const receipt={id:batchId,batchId,sha:file.sha,at:new Date().toISOString(),accepted,known,results,status:accepted?'awaiting_public_feed':'processed_without_publication',published:0};
      const [saved]=await db.tx.add('motor_d_import_receipts',[receipt]);
      if(!saved){const [existing]=await db.get<Receipt>('motor_d_import_receipts',[batchId],{consistent:true});if(!existing?.results?.length)throw Error('receipt_commit_failed');}
      return recordStatus('imported_waiting_for_feed',{batchId,accepted,known});
    }
    return recordStatus('no_unprocessed_batches');
  }catch(e){return recordStatus('bridge_error',{error:String(e).slice(0,180)});}
}

export async function confirmMotorDPublications(){
  let cursor:string|undefined;
  const pending:Receipt[]=[];
  for(let page=0;page<4;page++){
    const batch=await db.list<Receipt>('motor_d_import_receipts',{limit:100,...(cursor?{nextToken:cursor}:{})});
    pending.push(...batch.items.filter(x=>x.status==='awaiting_public_feed' && x.results?.length));
    if(!batch.nextToken)break;
    cursor=batch.nextToken;
  }
  if(!pending.length)return {checked:0,publishedBatches:0,waiting:0};
  const visibleIds=new Set<string>(),visibleUrls=new Set<string>();
  let feedCursor:string|undefined,complete=false;
  const cursors=new Set<string>();
  let feedCount=0;
  for(let pageNo=0;pageNo<100;pageNo++){
    const page=await readPublicFeedPage(feedCursor);
    if(!page || ('degraded' in page && page.degraded===true) ||
       ('feedRebuilding' in page && page.feedRebuilding===true))break;
    feedCount+=page.items.length;
    for(const row of page.items as Array<Record<string,unknown>>){
      if(typeof row.id==='string')visibleIds.add(row.id);
      const canonical=typeof row.url==='string'?publicFeedIdentity(row.url):null;
      if(canonical)visibleUrls.add(canonical);
    }
    if(!page.nextCursor){complete=feedCount>=Number(('totalJobOffers' in page && page.totalJobOffers)||0);break;}
    if(cursors.has(page.nextCursor))break;
    cursors.add(page.nextCursor);
    feedCursor=page.nextCursor;
  }
  if(!complete)return {checked:0,publishedBatches:0,waiting:pending.length,status:'feed_unavailable'};
  let publishedBatches=0,waiting=0;
  for(const batch of pending.slice(0,12)){
    let visible=0;
    for(const item of batch.results||[]){
      if(item.status==='expired'||item.status==='review_expired')continue;
      const id=item.internalId||item.existingId||('chatgpt_'+item.id);
      const [source]=await db.get<{url?:string}>('radar_jobs',[id]);
      const normalized=source?.url?publicFeedIdentity(source.url):null;
      if(visibleIds.has(id)||(normalized&&visibleUrls.has(normalized)))visible++;
    }
    const fullyVisible=visible>=Number(batch.accepted||0);
    await db.tx.update('motor_d_import_receipts',[{id:batch.id,record:{...batch,status:fullyVisible?'published':'awaiting_public_feed',published:visible,checkedAt:new Date().toISOString()}}]);
    if(fullyVisible)publishedBatches++;else waiting++;
  }
  return {checked:Math.min(12,pending.length),publishedBatches,waiting};
}

export async function motorDSocialImportHandler(){return {statusCode:200,body:'{"state":"social_legacy_paused"}'};}
