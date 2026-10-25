import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

function load(name) {
  const code=stripTypeScriptTypes(readFileSync('integrations/appdeploy/'+name+'.ts','utf8'),{mode:'transform'}).replace(/^export /gm,'');
  const ctx=vm.createContext({URL,Date,Set});
  vm.runInContext(code+`;globalThis.result=${name==='labor-news' ? '{visibleLaborNews,LABOR_NEWS,LABOR_RESOURCES}' : '{matchesTerritorialView,sponsorMatchesPlace,safeSponsorUrl,EXPLORATION_CITIES}'};`,ctx);
  return ctx.result;
}
const ui=load('territorial-exploration');
const news=load('labor-news');

test('all three secondary cities are opt-in even when Victoria remains in the inherited local configuration',()=>{
  const local=['Angol','Victoria'];
  assert.deepEqual(Array.from(ui.EXPLORATION_CITIES),['Los Ángeles','Victoria','Temuco']);
  for(const city of ui.EXPLORATION_CITIES){
    const item={id:city,kind:'job_offer',workCommunes:[city]};
    assert.equal(ui.matchesTerritorialView(item,'Todas',local),false);
    assert.equal(ui.matchesTerritorialView(item,city,local),true);
  }
  assert.equal(ui.matchesTerritorialView({id:'multi',kind:'job_offer',workCommunes:['Angol','Victoria']},'Todas',local),true);
});
test('community records are preserved and explicit workplace matching does not use portal titles',()=>{
  assert.equal(ui.matchesTerritorialView({id:'person',kind:'worker_available',workCommunes:[]},'Todas',['Angol']),true);
  assert.equal(ui.matchesTerritorialView({id:'x',kind:'job_offer',workCommunes:['Angol'],title:'Victoria Secret'},'Victoria',['Angol']),false);
});
test('advertising accepts the selected city or explicit regional coverage, never a nearby or stale-city campaign',()=>{
  assert.equal(ui.sponsorMatchesPlace({communes:['Angol'],scope:'exact'},'Angol'),true);
  assert.equal(ui.sponsorMatchesPlace({communes:['Angol'],scope:'exact'},'Temuco'),false);
  assert.equal(ui.sponsorMatchesPlace({communes:['Renaico'],scope:'nearby'},'Angol'),false);
  assert.equal(ui.sponsorMatchesPlace({communes:['Todas'],scope:'regional'},'Los Ángeles'),true);
  assert.equal(ui.sponsorMatchesPlace({communes:['Angol'],scope:'exact'},'Todas'),false);
});
test('unsafe sponsor destinations cannot be rendered as outbound links',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,test','http://example.com','https://user:secret@example.com']) assert.equal(ui.safeSponsorUrl(url),null);
  assert.equal(ui.safeSponsorUrl('https://example.cl/negocio'),'https://example.cl/negocio');
});
test('news has original dates and attribution; only reviewed regional labor topics within 45 days can be shown',()=>{
  const stamp=Date.parse('2026-10-21T12:00:00Z'),original=news.LABOR_NEWS[0];
  assert.equal(news.visibleLaborNews(news.LABOR_NEWS,stamp).length,1);
  for(const patch of [{reviewed:false},{publishedOn:'2026-10-22'},{publishedOn:'2026-02-31'},{publishedOn:'2026-01-01'},{topic:'Política'},{topic:'Sindical'},{region:'Biobío'},{source:''}]){
    assert.equal(news.visibleLaborNews([{...original,...patch}],stamp).length,0);
  }
  assert.equal(news.visibleLaborNews(news.LABOR_NEWS,Date.parse('2026-12-01')).length,0);
  assert(news.LABOR_RESOURCES.every(item=>item.url.startsWith('https://')));
});
test('visible advertising is measured only after intersection, and loading a sponsor no longer counts impressions',()=>{
  const component=readFileSync('integrations/appdeploy/territorial-sections.tsx','utf8');
  assert(component.includes('entry.intersectionRatio >= 0.5'));
  assert(component.includes("document.visibilityState !== 'visible'"));
  assert(component.includes("tc_sponsor_viewable_impression"));
  assert(component.includes('}, 1000)'));
  assert(!component.includes('fetch('));
  assert(component.includes('Las noticias no son ofertas ni suman al contador.'));
});
