import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
const ctx=vm.createContext({createHash});
vm.runInContext(stripTypeScriptTypes(readFileSync(new URL('../integrations/appdeploy/cmpc-evidence.ts',import.meta.url),'utf8'),{mode:'strip'}).replace(/^import .*;$/gm,'').replace(/^export /gm,''),ctx);
const captured=JSON.parse(readFileSync(new URL('fixtures/cmpc-public-18859.json',import.meta.url),'utf8'));
const now=Date.parse('2026-10-19T23:45:00Z'),checked=new Date(now).toISOString();
const hash=value=>createHash('sha256').update(value).digest('hex');
function offer(){const page=captured.page;return {source_url:page.url,application:page.url,title:'Ingeniero/a Procesos y Excelencia Sr',company:'CMPC',work_commune:'Collipulli',work_site:'Ubicación: Planta Pacífico - Mininco.',
  source_published_at:'2026-10-13T03:00:00.000Z',valid_through:'2027-01-09T03:00:00.000Z',verified_at:checked,
  source_evidence:{source_url:page.url,sha256:hash(page.text),text:page.text,complete_document:true},
  cmpc_evidence:{schema:'trabajo-cerca.cmpc-public-review.v1',requisition_id:18859,api_url:'https://us.api.csod.com/rec-job-search/external/jobs',api_json:captured.api_raw,api_sha256:hash(captured.api_raw),workplace_literal:'Ubicación: Planta Pacífico - Mininco.',employer_literal:'En CMPC',application_label:'Apply Now',reviewed_at:checked,date_precision:'day',deadline_policy:'start_of_local_date'}};}
test('real public CMPC page and its exact official response agree per role, original date, plant and application',()=>{
  assert.equal(hash(captured.api_raw),'c1993ee9e80ac8538ce217c15d95400df999fec1edb8347daeef505ca8b28ae4');
  assert.equal(ctx.validateCmpcEvidence(offer(),now),true);
});
test('search results, invented employer/workplace and edited dates cannot pass as an individual primary offer',()=>{
  for(const change of [{company:'Otra empresa'},{work_commune:'Angol'},{title:'Nombre del cargo - copy'},{valid_through:'2027-09-01T03:00:00.000Z'},{application:'https://example.org/apply'},{work_site:'Ubicación: Angol.'}])assert.throws(()=>ctx.validateCmpcEvidence({...offer(),...change},now));
  const item=offer();item.cmpc_evidence.api_json=item.cmpc_evidence.api_json.replace('18859','18858');assert.throws(()=>ctx.validateCmpcEvidence(item,now));
});
test('closed page, missing application and a different requisition response fail even with fresh hashes',()=>{
  for(const text of [captured.page.text+' Job closed',captured.page.text.replaceAll('Apply Now',''),captured.page.text.replace('req18859','req18943')]){
    const item=offer();item.source_evidence.text=text;item.source_evidence.sha256=hash(text);assert.throws(()=>ctx.validateCmpcEvidence(item,now));
  }
});
test('US editorial dates keep day precision with a conservative closing boundary in Chile',()=>{
  assert.equal(ctx.cmpcDate('10/20/2026'),'2026-10-20T03:00:00.000Z');
  assert.equal(ctx.cmpcDate('6/20/2026'),'2026-06-20T04:00:00.000Z');
  for(const date of ['31/10/2026','2/30/2026','10/20/2026 extra'])assert.throws(()=>ctx.cmpcDate(date));
});
