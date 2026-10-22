import { db, storage, json, error, increment, isAppDatabaseError, type RouterContext } from '@appdeploy/sdk';
import { createHash, randomUUID } from 'node:crypto';
import { HOUSE_DEFAULTS, validateHouseCampaign, type HouseCampaign, type CommercialAd } from '../shared/house-ads';
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const CONFIG = 'growth_house_config';
const METRICS = 'growth_house_metrics';
const privateJson = (value: unknown, status=200) => {
  const response = json(value,status);
  response.headers = { ...response.headers, 'Cache-Control':'no-store, private', Vary:'Authorization' };
  return response;
};
export async function houseConfiguration() {
  const [saved] = await db.get<{ revision:string; campaigns:HouseCampaign[] }>(CONFIG,['current'],{consistent:true});
  return saved ?? { revision:'defaults-v1', campaigns:HOUSE_DEFAULTS };
}
export async function advertisingCatalog() {
  const [config, commercial] = await Promise.all([houseConfiguration(),db.list<CommercialAd>('growth_campaigns',{limit:100})]);
  if (commercial.nextToken) throw Error('advertising_catalog_incomplete');
  const campaigns = config.campaigns.filter(c => c.status === 'active');
  const paths = [...new Set(campaigns.flatMap(c=>c.creatives.map(v=>v.storagePath).filter((p):p is string=>Boolean(p))))];
  const urls = paths.length ? await storage.url(paths) : [];
  return { complete:true, revision:config.revision, house:campaigns.map(c=>({...c,creatives:c.creatives.map(v=>({...v,imageUrl:urls.find(u=>u.path===v.storagePath)?.url}))})),commercial:commercial.items.map(c=>({id:c.id,businessName:c.businessName,headline:c.headline,detail:c.detail,url:c.url,communes:c.communes,category:c.category,status:c.status,startAt:c.startAt,endAt:c.endAt,priority:c.priority,placements:c.placements,adType:c.adType})),generatedAt:new Date().toISOString() };
}
export async function saveHouseConfiguration(ctx: RouterContext) {
  const input = ctx.body as { revision?:string; campaigns?:unknown[] };
  if (!input || !Array.isArray(input.campaigns) || !input.campaigns.length || input.campaigns.length>24) return error('Usa entre una y 24 campañas.',400);
  let campaigns:HouseCampaign[];
  try { campaigns=input.campaigns.map(validateHouseCampaign); } catch (cause) { return error(cause instanceof Error?cause.message:'Campaña inválida.',400); }
  if (new Set(campaigns.map(c=>c.id)).size !== campaigns.length) return error('IDs repetidos.',400);
  const current=await houseConfiguration();
  if (input.revision!==current.revision) return error('La configuración cambió. Recarga antes de guardar.',409);
  const record={revision:randomUUID(),campaigns,updatedAt:new Date().toISOString()};
  try {
    if(current.revision==='defaults-v1') {
      const [id]=await db.tx.add(CONFIG,[{id:'current',...record}]);
      if(!id)return error('La configuración cambió. Recarga.',409);
    }else{
      const [ok]=await db.tx.update(CONFIG,[{id:'current',record,if:{revision:current.revision}}],{patch:true});
      if(!ok)return error('La configuración cambió. Recarga.',409);
    }
  }catch(cause){if(isAppDatabaseError(cause)&&['AppDatabaseConflict','AppDatabaseConditionFailed','AppDatabaseDuplicateId'].includes(cause.code))return error('La configuración cambió. Recarga.',409);throw cause;}
  return privateJson(record);
}
export async function uploadHouseCreative(ctx:RouterContext) {
  const input=ctx.body as {content?:string;mime?:string};
  if(!input||typeof input.content!=='string'||input.content.length>280000||!['image/png','image/jpeg','image/webp'].includes(input.mime||''))return error('Usa PNG, JPEG o WebP, hasta 200 KB.',400);
  const bytes=Buffer.from(input.content,'base64');
  if(bytes.length>200000||bytes.toString('base64')!==input.content)return error('Archivo inválido.',400);
  const mime=input.mime;
  const valid=mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  if(!valid)return error('La imagen no coincide con el formato.',400);
  const path='house-creatives/'+digest(input.content)+(mime==='image/png'?'.png':mime==='image/jpeg'?'.jpg':'.webp');
  const [ok]=await storage.write([{path,content:input.content,contentType:mime!}]);
  if(!ok)return error('No se pudo guardar la creatividad.',503);
  return privateJson({storagePath:path},201);
}
export const CLIENT_HOUSE_EVENTS=['impression','click','form_started'] as const;
export const HOUSE_EVENTS=[...CLIENT_HOUSE_EVENTS,'registration_completed','profile_published','employer_added','advertiser_captured','trial_activated','paid_conversion'] as const;
type HouseEvent=typeof HOUSE_EVENTS[number];
export async function recordHouseEvent(attribution:unknown,event:HouseEvent,effectId:string) {
  if(!attribution||typeof attribution!=='object')return false;
  const a=attribution as {campaignId?:string;creativeId?:string};
  const config=await houseConfiguration();const campaign=config.campaigns.find(c=>c.id===a.campaignId);
  if(!campaign||!campaign.creatives.some(v=>v.id===a.creativeId))return false;
  const day=new Date().toISOString().slice(0,10);const id=digest(campaign.id+':'+a.creativeId+':'+day);
  const receipt=digest(event+':'+effectId);
  const table='growth_house_events';
  const [prior]=await db.get(table,[receipt],{consistent:true});
  if(prior)return true;
  await db.tx.add(METRICS,[{id,day,campaignId:campaign.id,creativeId:a.creativeId,type:'HOUSE_AD',impression:0,click:0,form_started:0,registration_completed:0,profile_published:0,employer_added:0,advertiser_captured:0,trial_activated:0,paid_conversion:0}]);
  try{
    await db.transact([
      db.tx.add(table,[{id:receipt,event,type:'HOUSE_AD',createdAt:new Date().toISOString()}]),
      db.tx.update(METRICS,[{id,record:{[event]:increment(1)}}],{patch:true}),
    ]);
  }catch(cause){
    if(isAppDatabaseError(cause)&&['AppDatabaseDuplicateId','AppDatabaseUnknownOutcome'].includes(cause.code)){
      const [saved]=await db.get(table,[receipt],{consistent:true});if(saved)return true;
    }throw cause;
  }
  return true;
}
export async function houseClientEvent(ctx:RouterContext) {
  const input=ctx.body as {event?:string;eventId?:string;campaignId?:string;creativeId?:string};
  if(!input||!CLIENT_HOUSE_EVENTS.includes(input.event as typeof CLIENT_HOUSE_EVENTS[number])||!input.eventId||!/^[-a-zA-Z0-9]{16,80}$/.test(input.eventId))return error('Evento inválido.',400);
  return json({received:await recordHouseEvent(input,input.event as HouseEvent,input.eventId),type:'HOUSE_AD',billing:false},202);
}
export async function houseDashboard(ctx:RouterContext) {
  const config=await houseConfiguration();
  const stats=await db.list(METRICS,{limit:50,...(ctx.query.cursor?{nextToken:ctx.query.cursor}:{})});
  return privateJson({...config,stats:stats.items,nextToken:stats.nextToken||null,metricsSource:'first_party_browser_reports_and_server_effects',billing:false,externalAnalyticsEnabled:false});
}
// Called after a real business effect has succeeded; never lets metrics break publishing.
export async function houseConversion(attribution:unknown,event:HouseEvent,effectId:string) {
  try { return await recordHouseEvent(attribution,event,effectId); }
  catch { console.warn('house_conversion_metric_pending',{event});return false; }
}

export async function trialApplications(ctx:RouterContext) {
  const page=await db.list('growth_advertiser_leads',{limit:25,...(ctx.query.cursor?{nextToken:ctx.query.cursor}:{})});
  return privateJson({items:page.items,nextToken:page.nextToken||null});
}
export async function activateFreeTrial(ctx:RouterContext) {
  const input=ctx.body as {leadId?:string;headline?:string;detail?:string;url?:string};
  if(!input||typeof input.leadId!=='string'||input.leadId.length>100||typeof input.headline!=='string'||!input.headline.trim()||input.headline.length>120||typeof input.detail!=='string'||!input.detail.trim()||input.detail.length>300)return error('Completa el anuncio revisado.',400);
  if(input.url){try{const u=new URL(input.url);if(u.protocol!=='https:'||u.username||u.password||u.hostname==='localhost'||!u.hostname.includes('.'))throw Error();}catch{return error('Enlace comercial inválido.',400);}}
  const [lead]=await db.get('growth_advertiser_leads',[input.leadId],{consistent:true});
  if(!lead)return error('Solicitud no encontrada.',404);
  const campaignId='trial-'+digest(input.leadId);
  const [existing]=await db.get('growth_campaigns',[campaignId],{consistent:true});
  if(existing)return privateJson({id:campaignId,duplicate:true,startAt:existing.startAt,endAt:existing.endAt});
  const startAt=new Date().toISOString();const endAt=new Date(Date.parse(startAt)+30*86400000).toISOString();
  try{
    await db.transact([
      db.tx.add('growth_campaigns',[{id:campaignId,adType:'COMMERCIAL_FREE',businessName:lead.businessName,category:lead.category,communes:[lead.commune],headline:input.headline.trim(),detail:input.detail.trim(),url:input.url||undefined,startAt,endAt,status:'active',label:'Publicidad local',priority:0,placements:['search'],createdAt:startAt}]),
      db.tx.update('growth_advertiser_leads',[{id:input.leadId,record:{trialCampaignId:campaignId,trialState:'active',trialStartAt:startAt,trialEndAt:endAt},if:{trialCampaignId:undefined}}],{patch:true}),
    ]);
  }catch(cause){
    if(isAppDatabaseError(cause)&&['AppDatabaseDuplicateId','AppDatabaseUnknownOutcome'].includes(cause.code)){
      const [saved]=await db.get('growth_campaigns',[campaignId],{consistent:true});if(saved)return privateJson({id:campaignId,duplicate:true,startAt:saved.startAt,endAt:saved.endAt});
    }throw cause;
  }
  await houseConversion(lead.houseAttribution,'trial_activated',campaignId);
  return privateJson({id:campaignId,startAt,endAt},201);
}
