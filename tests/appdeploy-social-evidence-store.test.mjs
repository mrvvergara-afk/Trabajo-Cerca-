import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const pure=stripTypeScriptTypes(readFileSync(new URL('../integrations/appdeploy/social-evidence.ts',import.meta.url),'utf8'),{ mode:'strip' }).replace(/^export /gm,'');
const store=stripTypeScriptTypes(readFileSync(new URL('../integrations/appdeploy/social-evidence-store.ts',import.meta.url),'utf8'),{ mode:'strip' }).replace(/^import .*;$/gm,'').replace(/^export /gm,'');
function harness({ partial=false,missing=false,wrong=false }={}) {
  const calls=[],rows=[];
  const h=vm.createContext({ URL,Date,Intl,Buffer,db:{
    async add(table,records) { calls.push(['add',table]); rows.push(...structuredClone(records)); return records.map((_,i)=>partial&&i===1?null:'evidence-'+i); },
    async get(table,ids) { calls.push(['get',table]); return ids.map(id=>missing?null:{ ...rows[Number(id.split('-')[1])],...(wrong?{ postUrl:'https://other.example/notice' }:{}) }); },
  } });
  vm.runInContext(pure+'\n'+store,h);
  return { h,calls,rows };
}
const notice=()=>({ postUrl:'https://www.facebook.com/municipio/posts/123',title:'Operador',text:'Se necesita Operador. '.repeat(100)+'Contacto: empleo@example.cl',company:'Empresa de prueba' });

test('Full transcription survives the compact capture index and reload from durable evidence records',async()=>{
  const { h,calls,rows }=harness();
  const index=await h.storeSocialFindings([notice()]);
  assert.equal(index[0].text.length,1100);
  assert.equal(index[0].textExcerpt,true);
  assert.ok(rows[0].text.includes('empleo@example.cl'));
  const restored=await h.hydrateSocialFindings(index);
  assert.equal(restored[0].text,notice().text);
  assert.equal(restored[0].transcriptionAvailable,true);
  assert.deepEqual(calls,[['add','social_notice_evidence'],['get','social_notice_evidence']]);
});

test('Partial evidence writes surface before the capture cursor can be confirmed',async()=>{
  const { h }=harness({ partial:true });
  await assert.rejects(h.storeSocialFindings([notice(),notice()]),/Partial social evidence insertion/);
});

test('Missing or mismatched references remain incomplete rather than substituting another offer',async()=>{
  for (const options of [{ missing:true },{ wrong:true }]) {
    const { h }=harness(options);
    const index=await h.storeSocialFindings([notice()]);
    const result=await h.hydrateSocialFindings(index);
    assert.equal(result[0].textTruncated,true);
    assert.equal(result[0].transcriptionAvailable,false);
  }
});

test('Oversized batches and legacy excerpts never cause unbounded reads or provider requests',async()=>{
  const { h,calls }=harness();
  await assert.rejects(h.storeSocialFindings(Array.from({ length:13 },notice)),/budget/);
  await assert.rejects(h.hydrateSocialFindings(Array.from({ length:61 },notice)),/budget/);
  assert.equal((await h.hydrateSocialFindings([notice()]))[0].text,notice().text);
  assert.equal(calls.length,0);
});
