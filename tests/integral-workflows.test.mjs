import assert from 'node:assert/strict';
import {test} from 'node:test';
import {hookSdk,memoryDatabase} from './memory-appdeploy.mjs';

const memory=memoryDatabase();
const hook=hookSdk(memory);
const queue=await import('../backend/verification-work.ts');
const metrics=await import('../backend/operational-metrics.ts');
const feed=await import('../backend/public-feed.ts');
const {db}=memory;
const start=Date.now();

test('verification recovery: concurrent lease, attempt recovery, idempotent uncertain commit',async()=>{
 const id='queue-verified';
 const before={kind:'job_offer',title:'Técnico',company:'Empresa',active:true,verified:false,url:'https://www.trabajando.cl/trabajo/12345-operario'};
 await db.tx.add('radar_jobs',[{...before,id}]);
 await queue.verificationIntake(id,start);
 const claims=await Promise.all(Array.from({length:12},()=>queue.claimVerification(id,before,'r1',start,start)));
 assert.equal(claims.filter(Boolean).length,1);
 const first=claims.find(Boolean);
 const second=await queue.claimVerification(id,before,'r1',start,start+181_000);
 assert.equal(second.attempts,2);
 assert.equal(await queue.settleVerification(first,before,{id,record:{...before,verified:true}},start+181_001),false);
 memory.failNextCommitResponse();
 assert.equal(await queue.settleVerification(second,before,{id,record:{...before,verified:true}},start+181_002),true);
 assert.equal((await db.get('radar_jobs',[id]))[0].verified,true);
 assert.equal((await db.list('tc_verification_attempts_v1')).items.length,1);
 assert.equal((await db.list('public_feed_changes')).items.length,1);
 assert.equal((await queue.readVerificationIntake(start+181_003)).fresh,0);
});

test('verification blocks unchanged evidence after its retry budget and reopens on evidence change',async()=>{
 const jobId='queue-blocked',before={kind:'job_offer',active:true,verified:false,title:'Oferta incompleta'};
 await db.tx.add('radar_jobs',[{id:jobId,...before}]);
 let now=start;
 for(let attempt=1;attempt<=5;attempt++){
  const [state]=await db.get('radar_jobs',[jobId]);
  const lease=await queue.claimVerification(jobId,state,'r1',start,now);
  assert.equal(lease.attempts,attempt);
  assert.equal(await queue.settleVerification(lease,state,{id:jobId,record:state},now+1,true),true);
  now+=queue.verificationRetryDelay(attempt)+10;
 }
 assert.equal(await queue.claimVerification(jobId,before,'r1',start,now),null);
 assert.equal((await queue.claimVerification(jobId,{...before,title:'Oferta con prueba'},'r1',start,now)).attempts,1);
});

test('feed pointer and public visibility share a commit; an update cannot count twice',async()=>{
 memory.tables.clear();
 const projector={project:item=>item.active&&item.verified?item:null,refreshAt:()=>null};
 await feed.advancePublicFeed(projector);
 await feed.advancePublicFeed(projector);
 await feed.advancePublicFeed(projector);
 const before=await feed.currentPublicFeedManifest();
 assert.ok(before);
 const now=new Date().toISOString();
 const id='catalogo-prueba';
 const job={id,kind:'job_offer',title:'Oferta nueva',active:true,verified:true,review:false,
   sourceProducer:'GEMINI',traceVersion:1,queuedAt:now,storedAt:now,
   url:'https://www.trabajando.cl/trabajo/99999-mecanico-angol',workCommunes:['Angol']};
 await db.tx.add('radar_jobs',[job]);
 await feed.registerPublicFeedChange('radar_jobs',id);
 await Promise.all([feed.advancePublicFeed(projector),feed.advancePublicFeed(projector)]);
 const actual=await feed.currentPublicFeedManifest();
 assert.notEqual(actual.manifestId,before.manifestId);
 assert.equal((await feed.readPublicFeedItem(id))?.verified,true);
 const first=(await db.list(metrics.VISIBLE)).items;
 assert.equal(first.length,1);
 assert.equal(first[0].manifestId,actual.manifestId);
 assert.equal(first[0].trace.engine,'GEMINI');
 await feed.registerPublicFeedChange('radar_jobs',id);
 await feed.advancePublicFeed(projector);
 assert.equal((await db.list(metrics.VISIBLE)).items.length,1);
 const view=await metrics.operationalView();
 assert.equal(view.visible,1);
 assert.equal(view.latency.p50.samples,1);
 assert.equal(view.motors.GEMINI,1);
});

test('histograms report observed bounds and distinguish empty data',()=>{
 assert.equal(metrics.latencyPercentile([0,0],0.95),null);
 assert.deepEqual(metrics.latencyPercentile([0,8,0,2],0.5),{upperMinutes:5,samples:10});
 assert.deepEqual(metrics.latencyPercentile([0,8,0,2],0.95),{upperMinutes:15,samples:10});
});

test.after(()=>hook.deregister());

test('progressive simulation: admitted work drains when capacity exceeds arrivals',async()=>{
 memory.tables.clear();
 let serial=0;
 const admit=async(count)=>{
  for(let i=0;i<count;i++){
   const id='load-'+(++serial);
   await db.tx.add('radar_jobs',[{id,kind:'job_offer',verified:false,active:true,title:'QA '+id}]);
   await queue.verificationIntake(id,start);
  }
 };
 await admit(120);
 const after=[];
 for(let cycle=0;cycle<10;cycle++){
  await admit(12);
  const intake=await queue.readVerificationIntake();
  for(let i=0;i<Math.min(24,intake.fresh);i+=4){
   await Promise.all(intake.items.slice(i,i+4).map(async entry=>{
    const {id,...before}=(await db.get('radar_jobs',[entry.jobId]))[0];
    const lease=await queue.claimVerification(id,before,'load',entry.admittedAt);
    assert.ok(lease);
    assert.equal(await queue.settleVerification(lease,before,{id,record:{...before,verified:true}}),true);
   }));
  }
  after.push(memory.tables.get('tc_verification_ready_v1').size);
 }
 assert.deepEqual(after,[108,96,84,72,60,48,36,24,12,0]);
 const events=[...memory.tables.get('tc_verification_attempts_v1').values()];
 assert.equal(events.length,240);
 assert.equal(new Set(events.map(e=>e.jobId)).size,240);
});
