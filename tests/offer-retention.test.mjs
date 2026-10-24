import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
const ctx=vm.createContext({});
for(const file of ['offer-retention.ts','feed-presentation.ts'])vm.runInContext(stripTypeScriptTypes(readFileSync(new URL('../integrations/appdeploy/'+file,import.meta.url),'utf8'),{mode:'strip'}).replace(/^export /gm,''),ctx);
const now=Date.parse('2026-10-20T02:00:00Z');
const previous={kind:'job_offer',active:true,verified:true,review:false,createdAt:'2026-09-01T00:00:00Z',sourcePublishedAt:'2026-09-01T00:00:00Z',externalVerifiedAt:'2026-10-17T00:00:00Z',sourceValidThrough:'2026-11-02T17:00:00Z'};
test('a published offer older than 45 days and a stale technical check do not remove an open vacancy',()=>{
  assert.equal(ctx.offerRetentionReason(previous,now),null);
  assert.equal(ctx.offerRecheckDue(previous,now),true);
  assert.equal(ctx.recentInApp({...previous,workCommunes:['Angol']},now),false);
});
test('only real expiry or explicit inactive/quality state excludes an approved offer',()=>{
  assert.equal(ctx.offerRetentionReason({...previous,sourceValidThrough:'2026-10-19T12:00:00Z'},now),'confirmed_application_deadline_elapsed');
  assert.equal(ctx.offerRetentionReason({...previous,active:false,closureReason:'closed_notice'},now),'closed_notice');
  assert.equal(ctx.offerRetentionReason({...previous,review:true},now),'approval_or_quality_review_required');
});
test('an old synthetic 45-day expiry is not presented as a confirmed source deadline',()=>{
  const item={...previous,sourceValidThrough:null,expiresAt:'2026-10-16T00:00:00Z'};
  assert.equal(ctx.confirmedOfferDeadline(item),null);
  assert.equal(ctx.offerRetentionReason(item,now),null);
  assert.equal(ctx.confirmedOfferDeadline({...item,expiresAt:'2026-10-18T00:00:00Z'}),Date.parse('2026-10-18T00:00:00Z'));
});
test('global totals and novelty do not depend on loaded page size or multi-commune counts',()=>{
  const summary={totalJobOffers:31,recentJobOffers7d:4,recentJobOffers24h:2,communeStats:{Angol:{jobs:5,newJobs7d:2,newJobs24h:1},Lumaco:{jobs:3,newJobs7d:2,newJobs24h:1}}};
  assert.equal(ctx.publishedInventoryCounts(summary).total,31);
  assert.equal(ctx.publishedInventoryCounts(summary).recent7d,4);
  assert.equal(ctx.publishedInventoryCounts(summary,'Angol').total,5);
  assert.equal(ctx.publishedInventoryCounts({...summary,totalJobOffers:0}).total,0);
  assert.equal(ctx.publishedInventoryCounts({...summary,recentJobOffers7d:undefined}).recent7d,null);
});
test('new in the app is a rolling seven-day interval, independent of original publication and rechecks',()=>{
  const item={...previous,createdAt:'2026-10-19T23:50:35Z',workCommunes:['Collipulli']};
  assert.equal(ctx.recentInApp(item,now),true);
  assert.equal(ctx.recentInApp({...item,createdAt:'2026-10-01T00:00:00Z',lastVerifiedAt:new Date(now).toISOString()},now),false);
  assert.equal(ctx.recentInApp({...item,createdAt:new Date(now+1).toISOString()},now),false);
});
