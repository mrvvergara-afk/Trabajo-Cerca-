import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync,mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { localSdk,runtime,proveConsumer } from '../scripts/document_consumer_proof.mjs';

const now=Date.parse('2026-10-17T23:30:00Z');
const records=JSON.parse(readFileSync(new URL('./fixtures/traiguen-document-units.json',import.meta.url))).records;
const clone=()=>structuredClone(records);

test('Actual reviewed municipal jobs survive local ingestion, feed identity, restart, replay and expiry',async()=>{
  const root=mkdtempSync(join(tmpdir(),'document-consumer-'));
  try {
    const report=await proveConsumer(clone(),join(root,'proof'),now);
    assert.equal(report.local_feed_confirmed,3);assert.equal(report.duplicates,0);
    assert.equal(report.restart_preserved,3);assert.equal(report.expired_visible,0);
    assert.equal(report.expired_source_records_retained,3);assert.equal(report.production_published,0);
    assert.equal(report.github_signature_transport_tested,false);
    assert.ok(report.visible_snapshot.every(r=>r.note.startsWith('Postulación presencial.')));
    assert.ok(report.visible_snapshot.every(r=>r.applicationUrl.includes('#page=')));
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('Each real title has a stable identity without changing the original source URL or legacy identities',()=>{
  const sdk=localSdk(':memory:');const app=runtime(sdk.db,now);
  try {
    const ids=records.map(r=>app.ctx.validateOffer(r,now));assert.equal(new Set(ids).size,3);
    assert.ok(records.every((r,i)=>r.candidate_id===ids[i].slice(0,24)));
    const legacy='https://www.chiletrabajos.cl/trabajo/operador-1';
    assert.equal(app.ctx.jobIdentity(legacy),createHash('sha256').update(legacy).digest('hex'));
    const changed=clone()[0];changed.document_unit.document_sha256='f'.repeat(64);
    assert.equal(app.ctx.validateOffer(changed,now),ids[0]);
  } finally {sdk.close();}
});

test('A tampered third offer is rejected before any SDK write',async()=>{
  const sdk=localSdk(':memory:');const app=runtime(sdk.db,now);
  try {
    const invalid=clone();invalid[2].valid_through='2026-11-03T17:00:00Z';
    await assert.rejects(app.ctx.storeVerifiedBatch({records:invalid,run_id:'0'},'invalid',app.mapper,now),/deadline differs/);
    assert.equal(sdk.connection.prepare('SELECT count(*) AS n FROM records').get().n,0);
  } finally {sdk.close();}
});

test('Document field references, in-person instructions, title key and original-page completeness are mandatory',()=>{
  const sdk=localSdk(':memory:');const app=runtime(sdk.db,now);
  try {
    const mutations=[
      r=>r.document_unit.pages.pop(),
      r=>{r.document_unit.pages[1].page=1;},
      r=>{r.document_unit.fields.workplace.text_object_sha256='0'.repeat(64);},
      r=>{r.document_unit.fields.workplace.literal='Oficina municipal, Traiguén';},
      r=>{r.document_unit.document_url='https://unrelated.example/bases.pdf';},
      r=>{r.document_unit.key='f'.repeat(64);},
      r=>{r.application_details.instructions='Llame al teléfono de consultas';},
      r=>{r.application='mailto:consulta@example.cl';},
      r=>{r.document_unit.reviewed_at='2026-10-15T00:00:00Z';},
      r=>{r.document_unit.reviewed_at='2026-10-18T00:00:00Z';},
      r=>{r.candidate_id='a'.repeat(24);r.idempotency_key='radar:'+r.candidate_id;},
      r=>{r.source_evidence={sha256:'a'.repeat(64),source_url:r.source_url,complete_document:true,text:'Excerpt masquerading as whole PDF'};},
    ];
    for (const mutate of mutations) {const row=clone()[0];mutate(row);assert.throws(()=>app.ctx.validateOffer(row,now));}
    assert.equal(sdk.connection.prepare('SELECT count(*) AS n FROM records').get().n,0);
  } finally {sdk.close();}
});

test('Repeated identities within a batch never overwrite another role or partially insert the batch',async()=>{
  const sdk=localSdk(':memory:');const app=runtime(sdk.db,now);
  try {
    const row=clone()[0];
    await assert.rejects(app.ctx.storeVerifiedBatch({records:[row,row],run_id:'0'},'duplicate',app.mapper,now),/Duplicate offer identity/);
    assert.equal(sdk.connection.prepare('SELECT count(*) AS n FROM records').get().n,0);
  } finally {sdk.close();}
});

test('The applied controller policy hides evidence after 24 hours and keeps the original deadline',async()=>{
  const sdk=localSdk(':memory:');const app=runtime(sdk.db,now);
  try {
    await app.ctx.storeVerifiedBatch({records:clone(),run_id:'0'},'local',app.mapper,now);await app.build();
    assert.equal((await app.feed()).filter(r=>r.documentUnitKey).length,3);
    const deadlines=(await app.feed()).filter(r=>r.documentUnitKey).map(r=>r.expiresAt);
    app.clock.now=Math.max(...records.map(r=>Date.parse(r.verified_at)))+86400001;
    await app.build();assert.equal((await app.feed()).filter(r=>r.documentUnitKey).length,0);
    const kept=sdk.connection.prepare("SELECT record FROM records WHERE table_name GLOB 'radar_external_*' AND length(table_name)=47").all();
    assert.equal(kept.length,3);assert.deepEqual(kept.map(r=>JSON.parse(r.record).expiresAt).sort(),Array.from(deadlines).sort());
  } finally {sdk.close();}
});
