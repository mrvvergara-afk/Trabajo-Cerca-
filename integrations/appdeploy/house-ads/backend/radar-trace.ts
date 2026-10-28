import { db } from '@appdeploy/sdk';
import { createHash } from 'node:crypto';
import { safePublicUrl } from './public-source-adapters';
import type { PublicVerification } from './public-source-verifier';

type Row = Record<string, unknown>;
export type CandidateState = 'verified' | 'recoverable' | 'review' | 'rejected' | 'inaccessible';
export const traceId = (url:string) => 'candidate-' + createHash('sha256').update(safePublicUrl(url) || url).digest('hex').slice(0,48);

export function candidateState(result:PublicVerification, http=200):CandidateState {
  if (result.status==='verified') return 'verified';
  if ([401,403,429].includes(http) || http===0 || /timeout|unavailable|robots|challenge|HTTP 5\d\d/.test(result.reason)) return 'inaccessible';
  if (result.status==='rejected') return 'rejected';
  if (result.status==='review_ready') return 'review';
  return 'recoverable';
}

// Add every discovered identity before bounded operational queues select work.
// Duplicate chosen IDs preserve prior validation, publication and retry evidence.
export async function rememberCandidates(items:Array<{url:string;source:string;publisherPage?:string}>, now=Date.now()) {
  const unique=[...new Map(items.map(item=>[traceId(item.url),item])).entries()];
  for (let i=0;i<unique.length;i+=30) {
    const rows=unique.slice(i,i+30).map(([id,item])=>({id,url:item.url,source:item.source,
      publisherPage:item.publisherPage || item.url,state:'recoverable',reason:'awaiting_read',
      reading:'pending',validation:'pending',publication:'not_stored',revision:0,
      firstSeenAt:new Date(now).toISOString(),nextAttemptAt:new Date(now).toISOString()}));
    const result=await db.tx.add('radar_candidate_trace',rows);
    if (result.length!==rows.length) throw new Error('Candidate discovery result incomplete');
  }
}

export async function recordCandidate(url:string, patch:Row, now=Date.now()) {
  const id=traceId(url);
  await rememberCandidates([{url,source:String(patch.source || 'Fuente original')}],now);
  const [old]=await db.get<Row>('radar_candidate_trace',[id],{consistent:true});
  if (!old) throw new Error('Candidate trace not readable after discovery');
  const revision=Number(old.revision || 0);
  const [ok]=await db.tx.update('radar_candidate_trace',[{id,if:{revision},
    record:{...patch,revision:revision+1,updatedAt:new Date(now).toISOString()}}],{patch:true});
  if (!ok) throw new Error('Candidate trace changed concurrently; retry retained');
  return id;
}

export async function recordVerification(url:string, result:PublicVerification, http:number, engine:'A'|'B', now=Date.now()) {
  const state=candidateState(result,http);
  return recordCandidate(url,{state,reason:result.reason,reading:state==='inaccessible'?'failed':'read',
    validation:state,engine,title:result.title || null,company:result.company || null,
    workCommune:result.work_commune || null,sourcePublishedAt:result.source_published_at || null,
    validThrough:result.valid_through || null,application:result.application || null,
    nextAttemptAt:['recoverable','inaccessible'].includes(state)?new Date(now+6*3600000).toISOString():null},now);
}
