import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const patch=JSON.parse(readFileSync(new URL('../integrations/appdeploy/local-social-evidence-repair.json',import.meta.url),'utf8'));
const diffs=patch.files.find(file=>file.filename==='backend/index.ts').diffs;
const verifier=diffs.find(diff=>diff.from.startsWith('async function verifyPendingOffer')).to;
const recovery=diffs.find(diff=>diff.from.startsWith('async function recoverHistoricVisualFindings')).to;
const mapper=diffs.find(diff=>diff.to.includes('function socialFindingRecord(')).to.split('\n\nexport const socialTerritorialCollectHandler')[0];
const pure=readFileSync(new URL('../integrations/appdeploy/social-evidence.ts',import.meta.url),'utf8').replace(/^export /gm,'');
const stamp=Date.parse('2026-10-13T02:00:00Z');
class ClockDate extends Date { constructor(...args) { super(...(args.length?args:[stamp])); } static now() { return stamp; } }
const places=text=>['Angol','Mininco','Negrete'].filter(place=>text.includes(place));
const code=stripTypeScriptTypes(pure+'\n'+mapper+'\n'+verifier+'\n'+recovery,{ mode:'strip' });

function harness({ findings=[],partial=false }={}) {
  const calls=[],jobs=[];
  let checkpoint;
  const context={ Date:ClockDate,URL,Intl,Buffer,console,AbortSignal,
    normalizeText:value=>String(value??'').trim().replace(/\s+/g,' '),extractCommunes:places,
    sourceDateLabel:value=>value,verificationHost:()=> 'facebook.com',
    sourceVerificationTier:()=> 'social',hasTargetEvidence:()=>true,isSpecificJobResult:()=>true,
    moderate:()=>true,isLikelyJobOpportunity:()=>true,unsafeContentReason:()=>'',
    staleDiscoveryDate:()=>false,parseDiscoveryDate:value=>Date.parse(value)||undefined,
    verificationTargets:record=>[...record.workCommunes,...record.recruitmentCommunes],
    VERIFICATION_VERSION:'test',DISCOVERY_MAX_AGE_DAYS:60,
    hydrateSocialFindings:async rows=>rows,
    db:{
      async list(table,options) {
        calls.push({ method:'list',table,options });
        if (table==='radar_social_recovery_cursor') return { items:checkpoint?[{ id:'cursor-id',...checkpoint }]:[] };
        if (table==='social_capture_runs') return { items:[{ id:'run-one',sourceName:'Radio local',territory:'Angol',processedAt:'2026-10-12T18:00:00Z',findings }],nextToken:'next-page' };
        if (table==='radar_jobs') return { items:structuredClone(jobs) };
        throw new Error('Unexpected database read');
      },
      async add(table,records) { calls.push({ method:'add',table }); checkpoint=structuredClone(records[0]); return ['cursor-id']; },
      async update(table,updates) { calls.push({ method:'update',table }); checkpoint=structuredClone(updates[0].record); return [true]; },
    },
    trackedFeedAdd:async (table,records)=>{ calls.push({ method:'offers',table,records }); jobs.push(...records.map((row,i)=>({ ...row,id:'job-'+jobs.length+'-'+i }))); return records.map((_,i)=>partial&&i===0?null:'added-'+i); },
    fetch:async()=>{ calls.push({ method:'fetch' }); throw new Error('No source reads authorized in this test'); },
    ai:{ scrape:async()=>{ calls.push({ method:'provider' }); throw new Error('Paid calls forbidden in this test'); } },
  };
  vm.createContext(context);vm.runInContext(code,context);
  return { context,calls,jobs,get checkpoint() { return checkpoint; } };
}
const finding=index=>({ postUrl:'https://www.facebook.com/municipio/posts/'+index,postDate:'2026-10-12T18:00:00Z',
  title:'Operador '+index,company:'',commune:'',contact:'empleo@example.cl',text:'Se necesita Operador '+index+'. OMIL Angol. Enviar CV a empleo@example.cl.' });

test('The actual app mapper keeps the publishing town separate and retains incomplete notices for review',()=>{
  const { context }=harness();
  const row=context.socialFindingRecord(finding(1),'Radio local','Angol','2026-10-12T18:00:00Z');
  assert.equal(row.company,'Empresa por confirmar');
  assert.deepEqual([...row.workCommunes],[]);
  assert.deepEqual([...row.recruitmentCommunes],['Angol']);
  assert.equal(row.source,'Radio local');
  assert.equal(row.verified,false);
  assert.equal(row.review,true);
});

test('The actual app verifier cannot publish a legacy social record from its contact and recent date alone',async()=>{
  const { context,calls }=harness();
  const input={ id:'one',title:'Operador',company:'Radio local',note:'Se necesita operador en Angol. empleo@example.cl',
    source:'Radio local',sourcePublishedAt:'2026-10-12T18:00:00Z',workCommunes:['Angol'],recruitmentCommunes:['Angol'],
    url:'https://www.facebook.com/municipio/posts/123',discoveredBy:'radar-social-visual',contact:'empleo@example.cl',review:true,verified:false };
  const checked=await context.verifyPendingOffer(input);
  assert.equal(checked.record.verified,false);
  assert.equal(checked.record.review,true);
  assert.match(checked.record.verificationReason,/transcripción original/);
  assert.equal(calls.length,0,'Missing evidence causes no source/provider call');
});

test('A large captured run advances through finding offsets without silently losing its remaining notices',async()=>{
  const h=harness({ findings:Array.from({ length:28 },(_,i)=>finding(i)) });
  await h.context.recoverHistoricVisualFindings();
  assert.equal(h.checkpoint.runId,'run-one');assert.equal(h.checkpoint.findingOffset,12);
  await h.context.recoverHistoricVisualFindings();
  assert.equal(h.checkpoint.findingOffset,24);
  await h.context.recoverHistoricVisualFindings();
  assert.equal(h.checkpoint.runId,null);assert.equal(h.checkpoint.nextToken,'next-page');
  assert.equal(h.jobs.length,28);
  assert.ok(h.calls.filter(call=>call.table==='social_capture_runs').every(call=>call.options.limit===3));
  assert.ok(h.calls.filter(call=>call.method==='offers').every(call=>call.records.length<=4));
  assert.equal(h.calls.filter(call=>call.method==='provider').length,0);
});

test('A partial candidate insert never advances the social recovery cursor',async()=>{
  const h=harness({ findings:[finding(1),finding(2)],partial:true });
  await assert.rejects(h.context.recoverHistoricVisualFindings(),/Partial social recovery insertion/);
  assert.equal(h.checkpoint,undefined);
  assert.equal(h.calls.filter(call=>call.method==='add'||call.method==='update').length,0);
});

test('A blocked original social post remains pending without an extra paid scrape fallback',async()=>{
  const h=harness();
  const literal={ ...finding(1),company:'Empresa de prueba',title:'Operador forestal',deadline:'2026-10-20',
    text:'Se necesita Operador forestal\nEmpresa: Empresa de prueba\nLugar de trabajo: Mininco\nContacto: empleo@example.cl\nPlazo: 20 de octubre de 2026' };
  const candidate=h.context.socialFindingRecord(literal,'Radio local','Angol','2026-10-13T01:00:00Z');
  assert.equal(candidate.socialEvidence.missing.length,0);
  h.context.fetch=async()=>({ status:403,ok:false,url:literal.postUrl });
  const result=await h.context.verifyPendingOffer({ ...candidate,id:'blocked' });
  assert.equal(result.record.verified,false);
  assert.equal(h.calls.filter(call=>call.method==='provider').length,0);
});

test('A redirect to another social post cannot verify the original captured offer',async()=>{
  const h=harness();
  const literal={ ...finding(1),company:'Empresa de prueba',title:'Operador forestal',deadline:'2026-10-20',
    text:'Se necesita Operador forestal\nEmpresa: Empresa de prueba\nLugar de trabajo: Mininco\nContacto: empleo@example.cl\nPlazo: 20 de octubre de 2026' };
  const candidate=h.context.socialFindingRecord(literal,'Radio local','Angol','2026-10-13T01:00:00Z');
  h.context.fetch=async()=>({ status:200,ok:true,url:'https://www.facebook.com/municipio/posts/other' });
  const result=await h.context.verifyPendingOffer({ ...candidate,id:'redirect' });
  assert.equal(result.record.verified,false);
  assert.match(result.record.verificationReason,/otra publicación/);
  assert.equal(h.calls.filter(call=>call.method==='provider').length,0);
});
