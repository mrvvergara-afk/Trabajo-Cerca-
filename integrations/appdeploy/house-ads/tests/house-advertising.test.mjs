import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const code=stripTypeScriptTypes(fs.readFileSync(new URL('../shared/house-ads.ts',import.meta.url),'utf8'));
const {allocateAdvertising,HOUSE_DEFAULTS,validateHouseCampaign}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const now=Date.parse('2026-10-22T12:00:00Z');
const base={house:HOUSE_DEFAULTS,commercial:[],complete:true,place:'Angol',category:'Todas',page:'home',now,turn:0,seen:{},completed:[],slots:['search','listing']};
const ad=(id,extra={})=>({id,businessName:'Fixture únicamente en pruebas',headline:'Anuncio de prueba',detail:'Contenido sintético',category:'Comercio',communes:['Angol'],status:'active',startAt:'2026-10-01T00:00:00Z',endAt:'2026-12-01T00:00:00Z',priority:0,...extra});
test('zero advertisers, professionals or employers still produce distinct own campaigns',()=>{
 const r=allocateAdvertising(base);assert.equal(r.search.type,'HOUSE_AD');assert.equal(r.listing.type,'HOUSE_AD');assert.notEqual(r.search.campaign.id,r.listing.campaign.id);assert.equal(HOUSE_DEFAULTS.length,4);
 assert(HOUSE_DEFAULTS.every(c=>validateHouseCampaign(c).type==='HOUSE_AD'));
});
test('rotation reaches all four campaigns and multiple creatives without timers',()=>{
 const ids=new Set();for(let turn=0;turn<8;turn++){const r=allocateAdvertising({...base,turn});ids.add(r.search.campaign.id);}assert.equal(ids.size,4);
 const c=structuredClone(HOUSE_DEFAULTS[0]);c.creatives.push({...c.creatives[0],id:'b'});assert.equal(allocateAdvertising({...base,house:[c],turn:1}).search.creative.id,'b');
});
test('single active legacy advertiser retains both prior placements',()=>{
 const r=allocateAdvertising({...base,commercial:[ad('legacy')]});assert.equal(r.search.type,'COMMERCIAL');assert.equal(r.listing.campaign.id,'legacy');
});
test('multiple advertisers respect territory; expired advertisements never occupy slots',()=>{
 const ads=[ad('angol'),ad('lumaco',{communes:['Lumaco']}),ad('expired',{priority:100,endAt:'2026-10-22T12:00:00Z'})];
 assert.equal(allocateAdvertising({...base,commercial:ads}).search.campaign.id,'angol');
 assert.equal(allocateAdvertising({...base,place:'Lumaco',commercial:ads}).search.campaign.id,'lumaco');
 assert.equal(allocateAdvertising({...base,place:'Todas',commercial:ads}).search.type,'HOUSE_AD');
 assert.equal(allocateAdvertising({...base,place:'Renaico',commercial:ads}).search.type,'HOUSE_AD');
});
test('partial occupancy fills free inventory without displacing a paid plan',()=>{
 const r=allocateAdvertising({...base,commercial:[ad('paid',{adType:'COMMERCIAL_PAID',placements:['search']}),ad('free',{adType:'COMMERCIAL_FREE',placements:['search'],priority:99})]});
 assert.equal(r.search.campaign.id,'paid');assert.equal(r.listing.type,'HOUSE_AD');
});
test('unknown inventory is not falsely treated as empty',()=>{
 const r=allocateAdvertising({...base,complete:false});assert.equal(r.search,null);assert.equal(r.listing,null);
});
test('session frequency, goal completion, pause, editorial schedule and category are enforced',()=>{
 const seen=Object.fromEntries(HOUSE_DEFAULTS.map(c=>[c.id,20]));assert.equal(allocateAdvertising({...base,seen}).search,null);
 const r=allocateAdvertising({...base,completed:['professional','advertiser','employer']});assert.equal(r.search.campaign.goal,'explore');assert.equal(r.listing,null);
 const c={...HOUSE_DEFAULTS[0],status:'paused'};assert.equal(allocateAdvertising({...base,house:[c]}).search,null);
 c.status='active';c.startAt='2027-01-01';assert.equal(allocateAdvertising({...base,house:[c]}).search,null);
 c.startAt=null;c.categories=['Agricultura'];assert.equal(allocateAdvertising({...base,house:[c]}).search,null);
});
test('invalid configuration and arbitrary destination/asset fields cannot become executable links',()=>{
 assert.throws(()=>validateHouseCampaign({...HOUSE_DEFAULTS[0],maxPerSession:0}));
 assert.throws(()=>validateHouseCampaign({...HOUSE_DEFAULTS[0],endAt:'not-a-date'}));
 assert.throws(()=>validateHouseCampaign({...HOUSE_DEFAULTS[0],creatives:[{...HOUSE_DEFAULTS[0].creatives[0],storagePath:'../../private'}]}));
 const clean=validateHouseCampaign({...HOUSE_DEFAULTS[0],url:'javascript:alert(1)',revenue:1000});assert(!('url'in clean));assert(!('revenue'in clean));
});

test('legacy exact territorial priority remains ahead of regional inventory',()=>{
 const r=allocateAdvertising({...base,commercial:[ad('regional',{communes:['Todas'],priority:99}),ad('local',{priority:0})]});assert.equal(r.search.campaign.id,'local');
});
