import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,shared,policy,launch,lead,NOW} from './marketing-harness.mjs';
const ad=(id,extra={})=>({id,businessName:'Negocio '+id,headline:'Ensayo aislado',detail:'No publicado',communes:['Angol'],category:'Comercio',status:'active',startAt:'2026-01-01T00:00:00Z',endAt:'2027-01-01T00:00:00Z',priority:0,placements:['search','listing'],adType:'COMMERCIAL_FREE',...extra});
test('official launch remains unset; trials cannot start accidentally',async()=>{
 const b=setup();assert.equal((await b.publicPromotion()).kind,'not_launched');assert.equal((await b.activateFreeTrial(lead(b,'a'))).statusCode,409);assert.equal(b.table('growth_campaigns').size,0);
});
test('twenty founders then a non-stackable fourteen day standard trial',async()=>{
 const b=setup();await launch(b);
 for(let i=0;i<22;i++){
  const r=JSON.parse((await b.activateFreeTrial(lead(b,'n'+i))).body);
  assert.equal(r.days,i<20?30:14);assert.equal(Date.parse(r.endAt)-Date.parse(r.startAt),r.days*86400000);
 }
 assert.equal((await b.commercialConfiguration()).foundersUsed,20);
 const replay=JSON.parse((await b.activateFreeTrial(lead(b,'n0'))).body);assert.equal(replay.duplicate,true);
 assert.equal((await b.activateFreeTrial(lead(b,'other','NEGOCIO N0'))).statusCode,409);
 assert.equal(b.table('growth_campaigns').size,22);
});
test('concurrent approvals preserve unique business entitlement and founder cap',async()=>{
 const b=setup();await launch(b,{founderSlots:2});
 const ctx=Array.from({length:8},(_,i)=>lead(b,'c'+i));
 const replies=await Promise.all(ctx.map(c=>b.activateFreeTrial(c)));
 for(let i=0;i<replies.length;i++)if(replies[i].statusCode===409)replies[i]=await b.activateFreeTrial(ctx[i]);
 assert(replies.every(r=>[200,201].includes(r.statusCode)));
 assert.equal((await b.commercialConfiguration()).foundersUsed,2);
 assert.equal([...b.table('growth_trial_entitlements').values()].filter(x=>x.promotion==='founder').length,2);
 const same=lead(b,'same','Negocio C0');assert.equal((await b.activateFreeTrial(same)).statusCode,409);
});
test('transaction failure consumes neither slot nor campaign',async()=>{
 const b=setup();await launch(b);const c=lead(b,'f');b.setFail(true);
 assert.equal((await b.activateFreeTrial(c)).statusCode,409);assert.equal((await b.commercialConfiguration()).foundersUsed,0);assert.equal(b.table('growth_campaigns').size,0);assert.equal(b.table('growth_trial_entitlements').size,0);
});
test('promotion window, paused configuration, and immutable founder counter',async()=>{
 const c={...policy.COMMERCIAL_DEFAULTS,launchAt:'2026-09-01T00:00:00Z'};
 assert.equal(policy.promotionOffer(c,NOW).days,14);assert.equal(policy.promotionOffer({...c,enabled:false},NOW).days,0);
 assert.equal(policy.validateCommercialConfig({...c,foundersUsed:999},{...c,foundersUsed:1}).foundersUsed,1);
 assert.throws(()=>policy.validateCommercialConfig({...c,launchAt:'2026-10-01'}, {...c,foundersUsed:1}));
 assert(policy.COMMERCIAL_DEFAULTS.plans.every(p=>p.approved===false&&p.vat==='pending'));
});
test('records after page fifty are eligible; expired campaigns disappear without billing',async()=>{
 const b=setup();for(let i=0;i<120;i++)b.table('growth_campaigns').set('x'+i,ad('x'+i,{communes:['Lumaco']}));
 b.table('growth_campaigns').set('last',ad('last'));
 assert.equal((await b.advertisingCatalog({place:'Angol'})).commercial[0].id,'last');
 assert.equal(b.reads.filter(x=>x.table==='growth_campaigns').length,2);
 assert.equal(policy.selectCommercial([ad('expired',{endAt:new Date(NOW).toISOString()})],'Angol',0,NOW).length,0);
 assert.equal(b.table('growth_house_metrics').size,0);
});
test('free rotation reaches every peer and prevents one business monopolizing two slots',()=>{
 const ads=Array.from({length:100},(_,i)=>ad('id'+String(i).padStart(3,'0')));const seen=new Set();
 for(let turn=0;turn<100;turn++){const picks=policy.selectCommercial(ads,'Angol',turn,NOW);assert.equal(picks.length,2);assert.notEqual(picks[0].businessName,picks[1].businessName);seen.add(picks[0].id);}
 assert.equal(seen.size,100);
 const paid=ad('paid',{adType:'COMMERCIAL_PAID',priority:10});assert.equal(policy.selectCommercial([...ads,paid],'Angol',45,NOW)[0].id,'paid');
 assert.equal(policy.selectCommercial(ads,'Negrete',1,NOW).length,0);
});
test('admin pagination and pause do not renew deadlines',async()=>{
 const b=setup();for(let i=0;i<125;i++)b.table('growth_campaigns').set('p'+i,ad('p'+i));
 let cursor;const ids=new Set();do{const p=JSON.parse((await b.commercialCampaigns({query:cursor?{cursor}:{}})).body);p.items.forEach(x=>ids.add(x.id));cursor=p.nextToken;}while(cursor);assert.equal(ids.size,125);
 const deadline=b.table('growth_campaigns').get('p0').endAt;assert.equal((await b.commercialCampaigns({body:{id:'p0',status:'paused'},user:{userId:'admin'}})).statusCode,200);assert.equal(b.table('growth_campaigns').get('p0').endAt,deadline);
 b.table('growth_campaigns').set('expired',ad('expired',{endAt:'2001-01-01'}));assert.equal((await b.commercialCampaigns({body:{id:'expired',status:'active'}})).statusCode,409);
});
test('cursor cycles surface failure; incomplete inventory never masquerades as no advertisers',async()=>{
 const b=setup({cycle:true});await assert.rejects(b.advertisingCatalog({place:'Angol'}),/cursor_cycle/);
});
test('commercial impressions and clicks are idempotent, private and never sales',async()=>{
 const b=setup();b.table('growth_campaigns').set('one',ad('one'));
 const ctx={body:{campaignId:'one',event:'impression',eventId:'event-id-00000000001',place:'Angol',placement:'search'}};
 assert.equal((await b.commercialClientEvent(ctx)).statusCode,202);await b.commercialClientEvent(ctx);
 const metric=[...b.table('growth_commercial_metrics').values()][0];assert.equal(metric.impression,1);assert.equal(metric.paid_conversion,0);assert.equal(b.table('growth_house_metrics').size,0);
 assert.equal((await b.commercialClientEvent({body:{...ctx.body,event:'paid_conversion'}})).statusCode,400);
 assert.equal((await b.commercialClientEvent({body:{...ctx.body,place:'Lumaco'}})).statusCode,400);
 assert.equal(b.table('growth_commercial_events').size,1);
});
test('stale admin configuration cannot overwrite newly consumed founder slots',async()=>{
 const b=setup();const initial=await launch(b);await b.activateFreeTrial(lead(b,'fresh'));
 const saved=JSON.parse((await b.commercialAdmin({body:{...initial,message:'Mensaje actualizado',foundersUsed:0},user:{userId:'admin'}})).body);
 assert.equal(saved.foundersUsed,1);
});
test('new private management routes require both SDK authentication and admin authorization',async()=>{
 const {readFileSync}=await import('node:fs');const code=readFileSync(new URL('../backend/index.ts',import.meta.url),'utf8');
 for(const route of ['GET /api/admin/marketing/commercial','PUT /api/admin/marketing/commercial','GET /api/admin/marketing/campaigns','PUT /api/admin/marketing/campaigns','GET /api/admin/marketing/commercial-metrics'])assert(code.includes("'"+route+"': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS),"));
 assert(code.includes("'POST /api/growth/commercial-events': [publicQuota("));
});
test('free publication can be edited and renewed only by its owner, without becoming a new offer',async()=>{
 const {readFileSync}=await import('node:fs');const {stripTypeScriptTypes}=await import('node:module');
 const source=stripTypeScriptTypes(readFileSync(new URL('../shared/owned-publication.ts',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
 const {ownedPublicationPatch}=await import('data:text/javascript;base64,'+Buffer.from('const COMMERCIAL_PLACES='+JSON.stringify(policy.COMMERCIAL_PLACES)+';'+source).toString('base64'));
 const record={id:'existing-id',createdAt:'2026-10-01',kind:'worker_available',origin:'direct',ownerToken:'private-key',title:'Oficio libre no catalogado',note:'Disponible',workLocation:'Angol',contact:'+56912345678'};
 assert.throws(()=>ownedPublicationPatch(record,{ownerToken:'another-user',consent:true}));
 assert.throws(()=>ownedPublicationPatch({...record,origin:'radar'}, {ownerToken:'private-key',consent:true}));
 const patch=ownedPublicationPatch(record,{ownerToken:'private-key',consent:true,title:'Otro oficio libre',renew:true},NOW);
 assert.equal(patch.title,'Otro oficio libre');assert.equal(patch.contact,record.contact);assert.equal(Date.parse(patch.expiresAt),NOW+21*86400000);assert(!('createdAt'in patch));assert(!('id'in patch));assert(!('verified'in patch));
});
test('historical trials and requests without advertising consent cannot grant another benefit',async()=>{
 const b=setup();await launch(b);const ctx=lead(b,'old','Negocio histórico');b.table('growth_advertiser_leads').get('old').advertisingConsent=false;
 assert.equal((await b.activateFreeTrial(ctx)).statusCode,409);
 b.table('growth_advertiser_leads').get('old').advertisingConsent=true;b.table('growth_campaigns').set('trial-legacy',ad('trial-legacy',{businessName:'NEGOCIO HISTORICO'}));
 assert.equal((await b.activateFreeTrial(ctx)).statusCode,409);assert.equal((await b.commercialConfiguration()).foundersUsed,0);
});
test('concurrent repeated approval of one lead creates only one campaign and one slot',async()=>{
 const b=setup();await launch(b);const ctx=lead(b,'same');const results=await Promise.all(Array.from({length:10},()=>b.activateFreeTrial(ctx)));
 assert(results.every(r=>[200,201].includes(r.statusCode)));assert.equal(b.table('growth_campaigns').size,1);assert.equal((await b.commercialConfiguration()).foundersUsed,1);
});
