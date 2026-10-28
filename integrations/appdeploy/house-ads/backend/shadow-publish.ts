import { db } from '@appdeploy/sdk';
import { safePublicUrl } from './public-source-adapters';
import { fetchPublicPage } from './public-source-http';
import { evaluateWithEvidence } from './evidence-job';
import { saveVerifiedPublicOffer } from './free-public-sources';
import { recordVerification, recordCandidate } from './radar-trace';

type Row=Record<string,unknown>;
// A physical-page cursor, not a filtered first-page slice: every candidate is visited.
// Failed rows retain backoff and their evidence; stored is distinct from public.
export async function publishQualifiedShadowOffers() {
  const [savedCursor]=await db.get<Row>('radar_shadow_publish_cursor',['current'],{consistent:true});
  const cursor=typeof savedCursor?.nextToken==='string'?savedCursor.nextToken:undefined;
  const page=await db.list<Row>('radar_shadow_b',{limit:8,...(cursor?{nextToken:cursor}:{})});
  const results:Row[]=[];
  for (const row of page.items) {
    if (!['recoverable','publishable'].includes(String(row.stage)) || row.locationConflict===true ||
        Date.parse(String(row.nextAttemptAt||''))>Date.now()) continue;
    const url=typeof row.url==='string'?safePublicUrl(row.url):null;
    if (!url) {results.push({candidateId:row.id,status:'review',reason:'invalid_url'});continue;}
    const source=await fetchPublicPage(url,url);
    const result=source.error?{status:'pending' as const,reason:source.error,url}:evaluateWithEvidence(url,source.raw,source.url,source.status);
    await recordVerification(url,result,source.status,'B');
    let patch:Row={lastAttemptAt:new Date().toISOString(),lastReason:result.reason,
      nextAttemptAt:new Date(Date.now()+6*3600000).toISOString()};
    if (result.status==='verified') {
      const stored=await saveVerifiedPublicOffer(result);
      patch={...patch,stage:'stored',sourceTable:stored.table,sourceId:stored.id,publication:'queued_for_feed',independentlyVerified:result.verification_method==='motor_b_html_original_source'};
      results.push({url,status:'stored_for_public_feed',sourceTable:stored.table,sourceId:stored.id,method:result.verification_method,feedConfirmed:false});
    } else {
      patch.stage=result.status==='rejected'?'closed':result.status==='review_ready'?'needs_review':'recoverable';
      results.push({url,status:patch.stage,reason:result.reason});
    }
    const [ok]=await db.tx.update('radar_shadow_b',[{id:row.id,record:patch}],{patch:true});
    if (!ok) throw new Error('Shadow publication receipt not saved');
    await recordCandidate(url,{source:row.source,shadowId:row.id,reason:result.reason});
  }
  const checkpoint={nextToken:page.nextToken||null,cycleComplete:!page.nextToken,updatedAt:new Date().toISOString()};
  const [ok]=savedCursor?await db.tx.update('radar_shadow_publish_cursor',[{id:'current',record:checkpoint}]):await db.tx.add('radar_shadow_publish_cursor',[{id:'current',...checkpoint}]);
  if (!ok) throw new Error('Shadow publication cursor not saved');
  console.warn('SHADOW_B_PUBLICATION '+JSON.stringify({examined:page.items.length,cycleComplete:!page.nextToken,results}));
  return {examined:page.items.length,cycleComplete:!page.nextToken,results};
}
