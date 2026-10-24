import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import { localSdk, runtime } from '../scripts/document_consumer_proof.mjs';

const INITIAL=Date.parse('2026-10-17T23:30:00Z');
const NOW=INITIAL+36*3600000;
const records=JSON.parse(readFileSync(new URL('./fixtures/traiguen-document-units.json',import.meta.url))).records;
const moduleCode=stripTypeScriptTypes(readFileSync(new URL('../integrations/appdeploy/document-revalidation.ts',import.meta.url),'utf8'),{mode:'strip'})
  .replace(/^import .*;$/gm,'').replace(/^export /gm,'');
const STATE='radar_document_revalidation_state';
const RECEIPTS='radar_document_revalidation_receipts';
const failure=code=>Object.assign(new Error(code),{code});

function transactions(sdk) {
  const events=[];
  const row=(table,id)=>{
    const value=sdk.connection.prepare('SELECT record FROM records WHERE table_name=? AND id=?').get(table,id);
    return value ? JSON.parse(value.record) : null;
  };
  function operation(action) {
    let used=false;
    return { execute(atomic=false) {assert.equal(used,false);used=true;return action(atomic);},
      then(resolve,reject) {return Promise.resolve().then(()=>this.execute(false)).then(resolve,reject);} };
  }
  sdk.db.tx={
    add(table,values) {return operation(atomic=>values.map(record=>{
      const id=record.id || randomUUID();
      if(row(table,id)) {if(atomic)throw failure('AppDatabaseDuplicateId');return null;}
      sdk.connection.prepare('INSERT INTO records VALUES(?,?,?)').run(table,id,JSON.stringify(record));
      events.push({method:'add',table,id});return id;
    }));},
    update(table,values,{patch=false}={}) {return operation(atomic=>values.map(item=>{
      const previous=row(table,item.id);
      const passed=Boolean(previous)&&Object.entries(item.if || {}).every(([key,value])=>Object.is(previous[key],value));
      if(!passed) {if(atomic)throw failure('AppDatabaseConditionFailed');return false;}
      const record=patch ? {...previous,...item.record} : item.record;
      for(const [key,value] of Object.entries(record))if(value===undefined)delete record[key];
      sdk.connection.prepare('UPDATE records SET record=? WHERE table_name=? AND id=?').run(JSON.stringify(record),table,item.id);
      events.push({method:'update',table,id:item.id});return true;
    }));},
  };
  sdk.db.transact=async operations=>{
    sdk.connection.exec('BEGIN');
    try {const result=operations.map(op=>op.execute(true));sdk.connection.exec('COMMIT');return result;}
    catch(error) {sdk.connection.exec('ROLLBACK');throw error;}
  };
  return {events,row};
}

async function harness(now=NOW) {
  const sdk=localSdk(':memory:'),atomic=transactions(sdk),app=runtime(sdk.db,INITIAL);
  await app.ctx.storeVerifiedBatch({records:structuredClone(records),run_id:'0'},'signed-original',app.mapper,INITIAL);
  await app.build();await app.ctx.confirmRadarPublications();
  const first=await app.feed();
  app.clock.now=now;
  Object.assign(app.ctx,{randomUUID,Response,TextDecoder,isAppDatabaseError:error=>typeof error?.code==='string'});
  vm.runInContext(moduleCode,app.ctx);
  const registry=vm.runInContext('REVIEWED_DOCUMENTS',app.ctx);
  const pdf=Buffer.from('%PDF-1.4\nOriginal source used only by the test');
  const document=registry[0];
  document.documentSha256=createHash('sha256').update(pdf).digest('hex');
  const refs=[];
  for(const unit of document.units) {
    const item=first.find(item=>item.externalCandidateId===unit.candidateId);
    const identity=app.ctx.jobIdentity(document.sourceUrl,item.documentUnitKey);
    const table='radar_external_'+identity.slice(0,32);
    // Match the real published SDK IDs, generated locally by the real consumer.
    unit.publishedId=item.id;
    const record=atomic.row(table,item.id);
    record.documentUnitProof.document_sha256=document.documentSha256;
    sdk.connection.prepare('UPDATE records SET record=? WHERE table_name=? AND id=?').run(JSON.stringify(record),table,item.id);
    refs.push({table,id:item.id,record:structuredClone(record)});
  }
  const calls=[];
  const html='<meta property="article:published_time" content="'+document.sourcePublishedAt+'">'
    +'<main><h1>Concurso público</h1><a href="'+document.documentUrl+'">Bases originales</a></main>';
  const fetcher=async url=>{
    calls.push(url);
    if(url.endsWith('/robots.txt'))return new Response('User-agent: *\nAllow: /',{headers:{'content-type':'text/plain'}});
    if(url===document.sourceUrl)return new Response(html,{headers:{'content-type':'text/html'}});
    return new Response(pdf,{headers:{'content-type':'application/pdf'}});
  };
  return {sdk,atomic,app,document,refs,pdf,html,calls,fetcher,close:()=>sdk.close(),
    run:(id='invocation-1',time=now,fetch=fetcher)=>app.ctx.revalidateReviewedDocuments(id,time,fetch)};
}

test('A real recheck renews only verification, keeps three IDs and original dates, and restores visibility after 24 hours',async()=>{
  const h=await harness();
  try {
    await h.app.build();assert.equal((await h.app.feed()).filter(r=>r.documentUnitKey).length,0);
    const result=await h.run();assert.equal(result.updated,3);assert.equal(result.status,'revalidated');
    assert.equal(h.calls.length,3);
    await h.app.build();const feed=(await h.app.feed()).filter(r=>r.documentUnitKey);
    assert.equal(feed.length,3);
    assert.deepEqual(feed.map(r=>r.id).sort(),h.refs.map(r=>r.id).sort());
    for(const ref of h.refs) {
      const record=h.atomic.row(ref.table,ref.id);
      for(const field of ['sourcePublishedAt','sourceValidThrough','expiresAt','createdAt','firstVerifiedAt','verifiedAt','applicationInstructions','externalBatchDigest'])
        assert.equal(record[field],ref.record[field],field);
      assert.deepEqual(record.documentUnitProof,ref.record.documentUnitProof);
      assert.equal(record.externalVerifiedAt,new Date(NOW).toISOString());
    }
    const status=await h.app.ctx.documentRevalidationStatus();
    assert.equal(status.documents[0].status,'revalidated');assert.equal(status.documents[0].registrationPending,false);
    assert.equal(status.providerCalls,0);assert.equal(status.newOffersDiscovered,0);
  } finally {h.close();}
});

test('Repeated cron invocations before the next due time make no source request and create no extra receipt',async()=>{
  const h=await harness();
  try {
    await h.run();const calls=h.calls.length;
    assert.equal((await h.run('invocation-2',NOW+15*60000)).status,'not_due');
    assert.equal(h.calls.length,calls);
    assert.equal((await h.sdk.db.list(RECEIPTS)).items.length,1);
  } finally {h.close();}
});

test('Temporary access and quota failures never refresh source evidence or delete offers',async()=>{
  for(const response of [()=>{throw new Error('offline');},()=>new Response('blocked',{status:429}),
    ()=>new Response('challenge',{headers:{'content-type':'text/html'}})]) {
    const h=await harness();
    try {
      const result=await h.run('network',NOW,response);
      assert.equal(result.updated,0);assert.equal(result.status,'source_unavailable');
      for(const ref of h.refs)assert.deepEqual(h.atomic.row(ref.table,ref.id),ref.record);
    } finally {h.close();}
  }
  const h=await harness();
  try {
    const get=h.sdk.db.get;
    h.sdk.db.get=async(...args)=>{if(args[0]===STATE)throw failure('AppDatabaseQuotaExceeded');return get(...args);};
    await assert.rejects(h.run(),{code:'AppDatabaseQuotaExceeded'});
    assert.equal(h.calls.length,0);
  } finally {h.close();}
});

test('Changed PDF, changed original date and explicit closure quarantine existing records without modifying approval or first publication',async()=>{
  for(const mutation of ['pdf','date','closed','gone']) {
    const h=await harness();
    try {
      const fetcher=async url=>{
        if(mutation==='pdf'&&url===h.document.documentUrl)return new Response(Buffer.from('%PDF-1.4\nChanged source'),{headers:{'content-type':'application/pdf'}});
        if(url===h.document.sourceUrl&&mutation!=='pdf')return mutation==='gone' ? new Response('',{status:410})
          : new Response(mutation==='date' ? h.html.replace('2026-10-01','2026-10-02')
            : h.html.replace('</main>','Postulación cerrada</main>'),{headers:{'content-type':'text/html'}});
        return h.fetcher(url);
      };
      const result=await h.run(mutation,NOW,fetcher);
      assert.equal(result.status,'requires_review');assert.equal(result.updated,0);assert.equal(result.quarantined,3);
      await h.app.build();assert.equal((await h.app.feed()).filter(r=>r.documentUnitKey).length,0);
      for(const ref of h.refs) {
        const record=h.atomic.row(ref.table,ref.id);
        assert.equal(record.externalVerifiedAt,ref.record.externalVerifiedAt);
        assert.deepEqual(record.documentUnitProof,ref.record.documentUnitProof);
        assert.equal(record.active,false);assert.equal(record.review,true);
      }
    } finally {h.close();}
  }
});

test('A failure after the atomic write is recovered by registering the same three records without another network request',async()=>{
  const h=await harness();
  try {
    const register=h.app.ctx.registerPublicFeedChange;
    h.app.ctx.registerPublicFeedChange=async()=>{throw new Error('registration interrupted');};
    await assert.rejects(h.run(),/registration interrupted/);
    assert.equal((await h.app.ctx.documentRevalidationStatus()).documents[0].registrationPending,true);
    h.app.ctx.registerPublicFeedChange=register;
    const calls=h.calls.length;
    assert.equal((await h.run('recover',NOW+15*60000)).status,'feed_registration_recovered');
    assert.equal(h.calls.length,calls);
    await h.app.build();assert.equal((await h.app.feed()).filter(r=>r.documentUnitKey).length,3);
    assert.equal((await h.sdk.db.list(RECEIPTS)).items.length,1);
  } finally {h.close();}
});

test('A concurrent change aborts all three record patches and the receipt instead of overwriting newer state',async()=>{
  const h=await harness();
  try {
    const transact=h.sdk.db.transact;
    h.sdk.db.transact=async operations=>{
      h.sdk.connection.prepare('UPDATE records SET record=json_set(record,\'$.externalBatchDigest\',\'newer\') WHERE table_name=? AND id=?')
        .run(h.refs[2].table,h.refs[2].id);
      return transact(operations);
    };
    await assert.rejects(h.run(),{code:'AppDatabaseConditionFailed'});
    assert.equal((await h.sdk.db.list(RECEIPTS)).items.length,0);
    for(const ref of h.refs)assert.equal(h.atomic.row(ref.table,ref.id).externalVerifiedAt,ref.record.externalVerifiedAt);
  } finally {h.close();}
});

test('An unknown transaction outcome is reconciled using its original receipt, without repeating the write',async()=>{
  const h=await harness();
  try {
    const transact=h.sdk.db.transact;let calls=0;
    h.sdk.db.transact=async operations=>{const result=await transact(operations);if(++calls===1)throw failure('AppDatabaseUnknownOutcome');return result;};
    assert.equal((await h.run()).updated,3);
    assert.equal((await h.sdk.db.list(RECEIPTS)).items.length,1);
    await h.app.build();assert.equal((await h.app.feed()).filter(r=>r.documentUnitKey).length,3);
  } finally {h.close();}
});

test('Expired deadlines, unapproved records and old original dates cannot be renewed',async()=>{
  for(const mutation of ['expired','review','missing','older']) {
    const time=mutation==='expired' ? Date.parse('2026-11-03T00:00:00Z') : mutation==='older' ? Date.parse('2026-11-16T13:00:00Z') : NOW;
    const h=await harness(time);
    try {
      if(mutation==='review')h.sdk.connection.prepare('UPDATE records SET record=json_set(record,\'$.review\',json(\'true\')) WHERE table_name=? AND id=?').run(h.refs[1].table,h.refs[1].id);
      if(mutation==='missing')h.sdk.connection.prepare('DELETE FROM records WHERE table_name=? AND id=?').run(h.refs[1].table,h.refs[1].id);
      const result=await h.run(mutation,time);assert.equal(result.updated,0);assert.equal(h.calls.length,0);
      for(const ref of h.refs)if(mutation!=='missing'||ref!==h.refs[1])assert.equal(h.atomic.row(ref.table,ref.id).externalVerifiedAt,ref.record.externalVerifiedAt);
    } finally {h.close();}
  }
});

test('Robots uses longest matching rules and agent specificity without interpreting another group as permission',async()=>{
  const h=await harness();
  try {
    const allows=h.app.ctx.documentRobotsAllow;
    assert.equal(allows('User-agent: *\nDisallow: /',h.document.documentUrl),false);
    assert.equal(allows('User-agent: *\nDisallow: /\nAllow: /wp-content/*.pdf$',h.document.documentUrl),true);
    assert.equal(allows('User-agent: other\nAllow: /\nUser-agent: *\nDisallow: /',h.document.sourceUrl),false);
    assert.equal(allows('User-agent: *\nAllow: /\nUser-agent: TrabajoCercaDocument\nDisallow: /',h.document.sourceUrl),false);
    let count=0;
    const result=await h.run('robots',NOW,async()=>{count++;return new Response('User-agent: *\nDisallow: /',{headers:{'content-type':'text/plain'}});});
    assert.equal(result.reason,'robots_disallowed');assert.equal(result.updated,0);assert.equal(count,1);
  } finally {h.close();}
});

test('Oversized and redirected source responses cannot refresh verified records',async()=>{
  for(const response of [()=>new Response('redirect',{status:302,headers:{location:'https://other.example/'}}),
    ()=>new Response('large',{headers:{'content-type':'text/plain','content-length':'50001'}})]) {
    const h=await harness();
    try {assert.equal((await h.run('bound',NOW,response)).updated,0);}
    finally {h.close();}
  }
});
