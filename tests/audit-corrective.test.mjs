import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sitemapWindow } from '../backend/sitemap-window.ts';
import { workingLinkKind, workingLinkRank } from '../backend/trabajando-queue-policy.ts';
import { selectRescueBatch } from '../backend/rescue-work-policy.ts';

const makeXml = (...paths) =>
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
  paths.map(path => '<url><loc>https://www.trabajando.cl/' + path + '</loc></url>').join('') +
  '</urlset>';

function chunks(xml, size = 11) {
  const bytes = new TextEncoder().encode(xml);
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset === bytes.length) return controller.close();
      controller.enqueue(bytes.subarray(offset, offset + size));
      offset = Math.min(offset + size, bytes.length);
    },
  });
}

test('sitemap: window resumes across split tags and entities without gaps', async () => {
  const xml = makeXml('trabajo/12345-angol?a=1&amp;b=2', 'trabajo/12346-purén', 'trabajo/12347');
  const first = await sitemapWindow(chunks(xml, 1), undefined, 2);
  const second = await sitemapWindow(chunks(xml, 3), first.next, 2);
  assert.equal(first.links.length, 2);
  assert.match(first.links[0], /a=1&b=2$/);
  assert.match(first.links[1], /purén$/);
  assert.equal(second.verifiedCursor, true);
  assert.deepEqual(second.links, ['https://www.trabajando.cl/trabajo/12347']);
  assert.equal(second.next, undefined);
});

test('sitemap: edited or shortened source invalidates prior checkpoint', async () => {
  const first = await sitemapWindow(chunks(makeXml('a', 'b')), undefined, 2);
  for (const xml of [makeXml('a', 'c'), makeXml('a')]) {
    const page = await sitemapWindow(chunks(xml), first.next, 10);
    assert.equal(page.verifiedCursor, false);
    assert.deepEqual(page.links, []);
    assert.equal(page.next, undefined);
  }
});

test('sitemap: rejects truncated XML, doctype, non-XML and byte overflow', async () => {
  for (const xml of ['<urlset><url><loc>oops', '<!DOCTYPE urlset><urlset/>', '<html/>']) {
    await assert.rejects(sitemapWindow(chunks(xml), undefined, 8));
  }
  await assert.rejects(sitemapWindow(chunks(makeXml('a')), undefined, 8, 15), /byte_budget/);
});

test('integration: XML larger than legacy HTTP limit yields a later target', async () => {
  const filler = Array.from({length: 9500}, (_, i) => 'trabajo/' + (20000 + i) + '-vacante-general');
  const xml = makeXml(...filler, 'trabajo/99660-tecnico-coigue');
  assert.ok(Buffer.byteLength(xml) > 600000);
  const first = await sitemapWindow(chunks(xml, 8192), undefined, filler.length);
  const resumed = await sitemapWindow(chunks(xml, 8192), first.next, 100);
  assert.equal(resumed.links.length, 1);
  assert.equal(workingLinkKind(resumed.links[0]), 'detail');
  assert.equal(workingLinkRank(resumed.links[0]), 0);
});

test('regression: territorial hints recognize aliases and flag Victoria homonyms', () => {
  const rank = slug => workingLinkRank('https://www.trabajando.cl/trabajo/12345-' + slug);
  for (const slug of ['coigue','coihue','huelehueico','mininco','capitan-pastene','tijeral','victoria']) assert.equal(rank(slug), 0);
  for (const slug of ['temuco','los-angeles']) assert.equal(rank(slug), 1);
  for (const slug of ['nueva-victoria','la-victoria','victoria-de-santiago']) assert.equal(rank(slug), 2);
});

test('rescue: fresh jobs get slots even when fast rechecks lead the input', () => {
  const lanes = {fast:['old-1','old-2','new-1'],document:['new-2'],recovery:['new-3']};
  assert.deepEqual(selectRescueBatch(lanes, 4, id => id.startsWith('old')), ['new-1','new-2','new-3','old-1']);
  assert.deepEqual(lanes.fast, ['old-1','old-2','new-1']);
});

test('rescue: unused lanes release capacity to the available work', () => {
  const lanes = {fast:[],document:[],recovery:['old-1','old-2']};
  assert.deepEqual(selectRescueBatch(lanes, 3, () => true), lanes.recovery);
});

test('canonical commune matching uses worksite aliases and rejects false Victoria', async () => {
  const { worksiteMentionsCommune } = await import('../backend/worksite-semantics.ts');
  for (const [site, commune] of [['Mininco','Collipulli'],['Capitán Pastene','Lumaco'],
    ['Tijeral','Renaico'],['Huelehueico','Renaico'],['Coihue','Negrete'],['Coigüe','Negrete']]) {
    assert.equal(worksiteMentionsCommune(site, commune), true);
  }
  for (const site of ['La Victoria, Santiago','Nueva Victoria, Tarapacá',"Victoria's Secret"]) {
    assert.equal(worksiteMentionsCommune(site, 'Victoria'), false);
  }
  assert.equal(worksiteMentionsCommune('Victoria, La Araucanía', 'Victoria'), true);
  assert.equal(worksiteMentionsCommune('Forestal Mininco', 'Collipulli'), false);
});

test('Gemini: a cursor is valid only for the same ordered GitHub blob', async () => {
  const {geminiCursorForSnapshot} = await import('../backend/gemini-verify-scheduler.ts');
  assert.equal(geminiCursorForSnapshot('v1','v1',16,32), 16);
  assert.equal(geminiCursorForSnapshot('v2','v1',16,32), 0);
  assert.equal(geminiCursorForSnapshot('v1','v1',32,32), 0);
  assert.equal(geminiCursorForSnapshot('v1','v1',2.5,32), 0);
});

test('verifier: use original job worksite, country, expiry and identity together', async () => {
  const { registerHooks } = await import('node:module');
  const hook = registerHooks({resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('.ts') && specifier.startsWith('.') && !specifier.endsWith('.ts')) {
      return next(specifier+'.ts',context);
    }
    return next(specifier,context);
  }});
  try {
    const {evaluatePublicJob} = await import('../backend/public-source-verifier.ts');
    const url = 'https://www.trabajando.cl/trabajo/12345-operario';
    const now = Date.parse('2026-11-24T12:00:00Z');
    const posting = {
      '@type':'JobPosting', url, title:'Operario',
      description:'Oferta laboral. Lugar real de trabajo: Coigüe.',
      hiringOrganization:{name:'Empresa de prueba'},
      jobLocation:{address:{addressCountry:'CL',addressLocality:'Santiago'}},
      datePosted:'2026-11-22', validThrough:'2026-11-29',
    };
    const verify = fields => {
      const html = '<p>Oferta laboral</p><script type="application/ld+json">' +
        JSON.stringify({...posting,...fields})+'</script>';
      return evaluatePublicJob(url,html,url,200,now);
    };
    const main = verify({});
    assert.equal(main.status,'verified');
    assert.equal(main.work_commune,'Negrete');
    assert.equal(verify({description:'Oferta laboral. Lugar de trabajo: La Victoria de Santiago.'}).status,'pending');
    assert.equal(verify({validThrough:'2026-11-20'}).reason,'expired_deadline');
    assert.equal(verify({url:'https://www.trabajando.cl/trabajo/98765-unrelated'}).status,'pending');
  } finally {
    hook.deregister();
  }
});

test('municipal RSS and Atom: decode links, reject DOCTYPE and advertising relations',async()=>{
 const {employmentFeedLinks}=await import('../backend/public-employment-feed.ts');
 const atom='<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Oferta laboral</title>'+
  '<link rel="alternate" href="/oferta?a=1&amp;b=2"/><link rel="enclosure" href="/aviso.pdf"/>'+
  '<link rel="related" href="/advertising"/></entry></feed>';
 assert.deepEqual(employmentFeedLinks(atom),[
  {target:'/oferta?a=1&b=2',title:'Oferta laboral',isAttachment:false},
  {target:'/aviso.pdf',title:'Oferta laboral',isAttachment:true},
 ]);
 assert.deepEqual(employmentFeedLinks('<rss><channel><item><link><![CDATA[https://test.example/empleo]]></link><title>Concurso</title></item></channel></rss>'),
  [{target:'https://test.example/empleo',title:'Concurso',isAttachment:false}]);
 assert.deepEqual(employmentFeedLinks('<rss><channel><item><link>/malformado</channel></rss>'),[]);
 assert.deepEqual(employmentFeedLinks('<!DOCTYPE rss><rss/>'),[]);
});

test('confirmed INMEL withdrawal is specific to the three historical Victoria cases',async()=>{
 const {registerHooks}=await import('node:module');
 const hook=registerHooks({resolve(specifier,context,next){
  if(context.parentURL?.endsWith('.ts')&&specifier.startsWith('.')&&!specifier.endsWith('.ts'))return next(specifier+'.ts',context);
  return next(specifier,context);
 }});
 try{
  const {confirmedTerritorialWithdrawal}=await import('../backend/public-source-adapters.ts');
  for(const title of ['Analista Técnico','Ayudante Obra Civil','Supervisor Obra Civil'])
   assert.equal(confirmedTerritorialWithdrawal({company:'INMEL Chile SpA',title,workCommunes:['Victoria']}),true);
  assert.equal(confirmedTerritorialWithdrawal({company:'Otra empresa',title:'Analista Técnico',workCommunes:['Victoria']}),false);
 }finally{hook.deregister();}
});

test('Gemini: inaccessible duplicate evidence cannot hold the cursor indefinitely',async()=>{
 const {nextGeminiVerifyCursor}=await import('../backend/gemini-verify-scheduler.ts');
 const causes=['duplicate_check_in_progress'];
 assert.equal(nextGeminiVerifyCursor(4,4,20,causes,0),4);
 assert.equal(nextGeminiVerifyCursor(4,4,20,causes,1),4);
 assert.equal(nextGeminiVerifyCursor(4,4,20,causes,2),8);
});

test('Motor A reserves six of ten checks for new candidates when both lanes have work',async()=>{
 const {recheckSlots}=await import('../backend/recheck-policy.ts');
 assert.equal(recheckSlots(82,10),4);
 assert.equal(recheckSlots(0,10),0);
});
