import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const engine=await import(process.env.RESTORE_ENGINE_PATH?pathToFileURL(process.env.RESTORE_ENGINE_PATH).href:new URL('../../isolated-restore.mjs',import.meta.url).href);
const moduleOf=async p=>await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(readFileSync(new URL('../'+p,import.meta.url),'utf8')).replace(/^import .*;$/gm,'')).toString('base64'));
const {beginEncryptedBackup,appendEncrypted}=await moduleOf('src/backup-crypto.ts');
const {HOUSE_DEFAULTS}=await moduleOf('shared/house-ads.ts');
const {COMMERCIAL_DEFAULTS,promotionOffer,selectCommercial,COMMERCIAL_PLACES}=await moduleOf('shared/commercial-policy.ts');
const ownerCode=stripTypeScriptTypes(readFileSync(new URL('../shared/owned-publication.ts',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
const {ownedPublicationPatch}=await import('data:text/javascript;base64,'+Buffer.from('const COMMERCIAL_PLACES='+JSON.stringify(COMMERCIAL_PLACES)+';'+ownerCode).toString('base64'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const createdAt='2026-10-21T00:00:00Z',endAt='2026-11-20T00:00:00Z';
const records={
 community_posts:['worker_available','worker_need','service_request'].map((kind,i)=>({id:'recovered-post-'+i,kind,origin:'direct',title:'Oficio libre del ensayo '+i,note:'Solo restauración aislada',workLocation:'Angol',contact:'+56900000000',ownerToken:'fixture-key-'+i,createdAt,expiresAt:endAt,active:true})),
 radar_jobs:[{id:'recovered-job',kind:'job_offer',origin:'radar',title:'Puesto del ensayo',workLocation:'Angol',createdAt,sourcePublishedAt:'2026-10-13T00:00:00Z',expiresAt:endAt,active:true,verified:true}],
 growth_campaigns:Array.from({length:20},(_,i)=>({id:'recovered-campaign-'+i,advertiserId:'business-'+i,adType:'COMMERCIAL_FREE',businessName:'Negocio de ensayo '+i,headline:'Ensayo aislado',detail:'Nunca publicado en AppDeploy',communes:['Angol'],category:'Comercio',status:'active',priority:0,placements:['search'],startAt:createdAt,endAt})),
 growth_advertiser_leads:Array.from({length:20},(_,i)=>({id:'recovered-lead-'+i,businessName:'Negocio de ensayo '+i,commune:'Angol',advertisingConsent:true,trialCampaignId:'recovered-campaign-'+i})),
 growth_trial_entitlements:Array.from({length:20},(_,i)=>({id:'business-'+i,leadId:'recovered-lead-'+i,campaignId:'recovered-campaign-'+i,promotion:'founder',days:30,startAt:createdAt,endAt})),
 growth_commercial_config:[{id:'current',...COMMERCIAL_DEFAULTS,revision:'restored-config',launchAt:'2026-10-01T00:00:00Z',foundersUsed:20}],
 growth_house_config:[{id:'current',revision:'restored-house',campaigns:HOUSE_DEFAULTS}],
 growth_house_metrics:[{id:'own-metric',campaignId:'house-professionals',type:'HOUSE_AD',impression:2,click:1}],
 growth_commercial_metrics:[{id:'external-metric',campaignId:'recovered-campaign-0',type:'COMMERCIAL_FREE',impression:3,click:1}],
 growth_commercial_audit:[],
 public_feed_control:[{id:'control',manifestId:'recovered-manifest'}],
 public_feed_manifests:[{id:'recovered-manifest',schema:2,pages:[{id:'recovered-page',keys:['community_posts:recovered-post-0','radar_jobs:recovered-job']}]}],
 public_feed_versions:[{id:'recovered-page',entries:[{sourceId:'recovered-post-0',item:{id:'recovered-post-0',title:'Oficio del ensayo',hasContact:true}},{sourceId:'recovered-job',item:{id:'recovered-job',title:'Puesto del ensayo',sourcePublishedAt:'2026-10-13T00:00:00Z'}}]}],
 notification_preferences:[{id:'fixture-user',active:false,communes:['Angol']}],
};
const password=randomUUID()+randomUUID();const {envelope,key}=await beginEncryptedBackup(password);
for(const [table,items] of Object.entries(records))await appendEncrypted(envelope,key,{kind:'table',table,items});
await appendEncrypted(envelope,key,{kind:'file',path:'fixture/icon-192.png',content:readFileSync(new URL('../public/icon-192.png',import.meta.url)).toString('base64')});
await appendEncrypted(envelope,key,{kind:'manifest',appId:'trabajo-cerca-laboratorio-3ojgro',complete:true,tables:Object.entries(records).map(([table,rows])=>({table,count:rows.length})),files:1,parts:envelope.parts.length});
mkdirSync('qa-output',{recursive:true});const backup='qa-output/isolated-recovery-input.tcbackup';writeFileSync(backup,JSON.stringify(envelope),{mode:0o600});
const plan=await engine.prepareRestorePlan(readFileSync(backup,'utf8'),password);const target=engine.createTemporaryRestoreTarget();
try{
 const verification=engine.restorePreparedPlan(plan,target);const units=plan.entries.map(e=>JSON.parse(target.read(e.key)));
 const rows=table=>units.filter(u=>u.kind==='record'&&u.table===table).map(u=>u.record);
 for(const entitlement of rows('growth_trial_entitlements')){assert(rows('growth_campaigns').some(c=>c.id===entitlement.campaignId));assert(rows('growth_advertiser_leads').some(l=>l.id===entitlement.leadId));}
 assert.equal(promotionOffer(rows('growth_commercial_config')[0],Date.parse('2026-10-22')).days,14);
 assert.equal(rows('growth_house_config')[0].campaigns.length,6);
 assert.equal(selectCommercial(rows('growth_campaigns'),'Angol',2,Date.parse('2026-10-22')).length,1);
 assert.equal(rows('growth_house_metrics')[0].type,'HOUSE_AD');assert.equal(rows('growth_commercial_metrics')[0].type,'COMMERCIAL_FREE');
 assert.equal(rows('public_feed_versions')[0].entries[0].item.contact,undefined);assert.equal(rows('notification_preferences')[0].active,false);
 const entry=plan.entries.find(e=>{const u=JSON.parse(e.text);return u.kind==='record'&&u.id==='recovered-post-0';});const unit=JSON.parse(target.read(entry.key));
 assert.throws(()=>ownedPublicationPatch(unit.record,{ownerToken:'wrong',consent:true,title:'Wrong'}));assert.equal(hash(target.read(entry.key)),entry.sha256);
 const patch=ownedPublicationPatch(unit.record,{ownerToken:'fixture-key-0',consent:true,title:'Editado después de recuperar',renew:true},Date.parse('2026-10-22'));
 const updated={...unit,record:{...unit.record,...patch}};const text=JSON.stringify(updated);target.transaction(()=>target.replace({...entry,text,sha256:hash(text)}));target.reopen();
 const read=JSON.parse(target.read(entry.key));assert.equal(read.record.title,'Editado después de recuperar');assert.equal(read.id,'recovered-post-0');assert.equal(read.record.createdAt,createdAt);
 assert.equal(target.remove(entry.key),1);assert.throws(()=>target.read(entry.key),/missing_target_unit/);
 const report={...verification,fixturesOnly:true,source:'representative synthetic app snapshot saved and reread as encrypted file',recoveredFounderSlots:20,standardTrialDaysAfterRecovery:14,advertiserCampaignRelationsChecked:20,privateOwnerDataRecovered:true,wrongOwnerRejected:true,postRestoreEditRenewDelete:true,jobOriginalDatePreserved:rows('radar_jobs')[0].sourcePublishedAt==='2026-10-13T00:00:00Z',houseAndCommercialMetricsSeparated:true,automaticNotificationsDisabled:true,platformRestoreTested:false,realSdkUsed:false,limitations:['No restaura identidades OAuth, secretos ni infraestructura de AppDeploy.','No es la copia privada del propietario: no se solicitó ni obtuvo su contraseña.','Valida formato, persistencia SQLite cifrada, relaciones y reglas funcionales recuperadas.']};
 writeFileSync('qa-output/rc-restore.json',JSON.stringify(report,null,2));console.log('RC_RESTORE_PROOF '+JSON.stringify(report));
}finally{target.dispose();unlinkSync(backup);}
