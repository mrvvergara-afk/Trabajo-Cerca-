import { COMMERCIAL_DEFAULTS, COMMERCIAL_PLACES, promotionOffer, validateCommercialConfig, businessIdentity, selectCommercial, type CommercialConfig } from '../shared/commercial-policy';
import { db, storage, json, error, increment, isAppDatabaseError, type RouterContext } from '@appdeploy/sdk';
import { createHash, randomUUID } from 'node:crypto';
import {validCreativePath,type AdMedia} from '../shared/ad-images';
import {inspectCreative} from './image-validation';
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
  if(!saved)return {revision:'defaults-v1',campaigns:HOUSE_DEFAULTS};
  const campaigns=saved.campaigns.map(c=>({...c,creatives:c.creatives.map(v=>({...v,message:v.message==='¡Promociona tu negocio! 30 días de publicidad gratis en Trabajo Cerca.'?'Promociona tu negocio y conoce la promoción vigente.':v.message,mobileMessage:v.mobileMessage==='Tu negocio: 30 días de publicidad gratis.'?'Conoce la promoción vigente.':v.mobileMessage}))}));
  for(const extra of HOUSE_DEFAULTS.filter(c=>['house-inclusion','house-local-business'].includes(c.id)))if(!campaigns.some(c=>c.id===extra.id))campaigns.push(extra);
  return {...saved,campaigns};
}
// Complete pagination is server-side. Never send the entire commercial table to a browser.
let inventoryCache: {at:number;items:CommercialAd[]}|null=null;
let inventoryEpoch=0;
let inventoryFlight:Promise<CommercialAd[]>|null=null;
export function invalidateCommercialInventory(){inventoryCache=null;inventoryEpoch++;}
export async function commercialInventory() {
  if(inventoryCache&&Date.now()-inventoryCache.at<30000)return inventoryCache.items;
  if(inventoryFlight)return inventoryFlight;
  const epoch=inventoryEpoch;
  inventoryFlight=(async()=>{
    const items:CommercialAd[]=[];const tokens=new Set<string>();let nextToken:string|undefined;
    let bytes=0;
    for(let page=0;page<200;page++){
      const batch=await db.list<CommercialAd>('growth_campaigns',{limit:100,...(nextToken?{nextToken}:{})});
      for(const row of batch.items){
        const ad={id:row.id,businessName:row.businessName,headline:row.headline,detail:row.detail,url:row.url,communes:row.communes,category:row.category,status:row.status,startAt:row.startAt,endAt:row.endAt,priority:row.priority,placements:row.placements,adType:row.adType,image:row.image,logo:row.logo};
        bytes+=Buffer.byteLength(JSON.stringify(ad));
        if(bytes>8*1024*1024)throw Error('advertising_inventory_byte_budget');
        items.push(ad);
      }
      nextToken=batch.nextToken;
      if(!nextToken){if(epoch!==inventoryEpoch)throw Error('advertising_inventory_changed');inventoryCache={at:Date.now(),items};return items;}
      if(tokens.has(nextToken))throw Error('advertising_cursor_cycle');tokens.add(nextToken);
    }
    throw Error('advertising_inventory_page_budget');
  })();
  try{return await inventoryFlight;}finally{inventoryFlight=null;}
}
export async function commercialConfiguration():Promise<CommercialConfig> {
  const [saved]=await db.get<CommercialConfig>('growth_commercial_config',['current'],{consistent:true});
  return saved??structuredClone(COMMERCIAL_DEFAULTS);
}
export async function publicPromotion(){return promotionOffer(await commercialConfiguration());}
export async function advertisingCatalog(query:Record<string,string>={}) {
  const [config,commercial,promotion]=await Promise.all([houseConfiguration(),commercialInventory(),publicPromotion()]);
  const campaigns=config.campaigns.filter(c=>c.status==='active');
  const place=COMMERCIAL_PLACES.includes(query.place)?query.place:'Todas';
  const parsedTurn=Number(query.turn);const turn=Number.isSafeInteger(parsedTurn)&&parsedTurn>=0?parsedTurn:0;
  const selected=selectCommercial(commercial,place,turn);
  const approved=(m:AdMedia|null|undefined)=>m?.approved===true&&validCreativePath(m.storagePath)?m.storagePath:undefined;
  const paths=[...new Set([...campaigns.flatMap(c=>c.creatives.filter(v=>!v.imageDisabled).map(v=>v.storagePath)),...selected.flatMap(ad=>[approved(ad.image),approved(ad.logo)])].filter((s):s is string=>!!s))];
  let urls:Array<{path:string;url:string}>=[];try{urls=paths.length?await storage.url(paths):[];}catch{console.warn('advertising_image_urls_unavailable');}
  const resolved=(path?:string)=>urls.find(u=>u.path===path)?.url;
  return {complete:true,revision:config.revision,promotion,house:campaigns.map(c=>({...c,creatives:c.creatives.map(v=>({...v,imageUrl:v.imageDisabled?undefined:v.storagePath?resolved(v.storagePath):HOUSE_DEFAULTS.find(d=>d.id===c.id)?.creatives[0]?.imageUrl}))})),commercial:selected.map(ad=>{const {image,logo,...safe}=ad;return {...safe,imageUrl:resolved(approved(image)),logoUrl:resolved(approved(logo))};}),generatedAt:new Date().toISOString()};
}
export async function commercialAdmin(ctx:RouterContext){
  if(ctx.body){
    const current=await commercialConfiguration();const input=ctx.body as CommercialConfig;
    if(input.revision!==current.revision)return error('La configuración cambió. Recarga.',409);
    let next:CommercialConfig;
    try{next={...validateCommercialConfig(input,current),revision:randomUUID()};}catch(cause){return error(cause instanceof Error?cause.message:'Configuración inválida.',400);}
    const record={...next,updatedAt:new Date().toISOString(),updatedBy:ctx.user?.userId};
    try{
      await db.transact([
        current.revision==='commercial-defaults-v1'?db.tx.add('growth_commercial_config',[{id:'current',...record}]):db.tx.update('growth_commercial_config',[{id:'current',record,if:{revision:current.revision,foundersUsed:current.foundersUsed}}],{patch:true}),
        db.tx.add('growth_commercial_audit',[{id:randomUUID(),action:'configuration',actor:ctx.user?.userId,revision:next.revision,at:new Date().toISOString()}]),
      ]);
    }catch(cause){if(isAppDatabaseError(cause)&&['AppDatabaseConditionFailed','AppDatabaseConflict','AppDatabaseDuplicateId','AppDatabaseUnknownOutcome'].includes(cause.code))return error('No se confirmó el cambio; recarga antes de reintentar.',409);throw cause;}
    return privateJson({...next,promotion:promotionOffer(next)});
  }
  const config=await commercialConfiguration();return privateJson({...config,promotion:promotionOffer(config)});
}
export async function commercialCampaigns(ctx:RouterContext){
  if(!ctx.body){const page=await db.list('growth_campaigns',{limit:25,...(ctx.query.cursor?{nextToken:ctx.query.cursor}:{})});return privateJson({items:page.items,nextToken:page.nextToken||null});}
  const input=ctx.body as {id?:string;status?:string;media?:{slot:'image'|'logo';storagePath:string|null;rightsConfirmed?:boolean;contentApproved?:boolean}};
  if(!input?.id||input.id.length>150||(!input.media&&!['active','paused','rejected'].includes(input.status||'')))return error('Estado inválido.',400);
  const [current]=await db.get<CommercialAd>('growth_campaigns',[input.id],{consistent:true});
  if(!current)return error('Campaña inexistente.',404);
  if(input.media){
    const m=input.media;if(!['image','logo'].includes(m.slot))return error('Ubicación de imagen inválida.',400);
    if(m.storagePath!==null){
      if(!validCreativePath(m.storagePath)||m.rightsConfirmed!==true||m.contentApproved!==true)return error('Confirma autorización y revisión de contenido.',400);
      const [file]=await storage.read([m.storagePath]);if(!file?.content)return error('Imagen no encontrada.',404);
      try{inspectCreative(file.content,m.storagePath.endsWith('.png')?'image/png':m.storagePath.endsWith('.jpg')?'image/jpeg':'image/webp');}catch{return error('Imagen inválida.',400);}
    }
    const record=m.storagePath?{storagePath:m.storagePath,approved:true,reviewedAt:new Date().toISOString()}:null;
    await db.transact([db.tx.update('growth_campaigns',[{id:input.id,record:{[m.slot]:record,mediaRevision:randomUUID()},if:{status:current.status,mediaRevision:current.mediaRevision}}],{patch:true}),db.tx.add('growth_commercial_audit',[{id:randomUUID(),action:m.storagePath?'image_approved':'image_removed',campaignId:input.id,slot:m.slot,actor:ctx.user?.userId,at:new Date().toISOString()}])]);
    invalidateCommercialInventory();return privateJson({id:input.id,[m.slot]:record});
  }
  if(input.status==='active'&&(!Number.isFinite(Date.parse(current.endAt))||Date.parse(current.endAt)<=Date.now()))return error('La campaña venció. No se renueva al activarla.',409);
  await db.transact([
    db.tx.update('growth_campaigns',[{id:input.id,record:{status:input.status},if:{status:current.status}}],{patch:true}),
    db.tx.add('growth_commercial_audit',[{id:randomUUID(),action:'campaign_status',campaignId:input.id,actor:ctx.user?.userId,status:input.status,at:new Date().toISOString()}]),
  ]);invalidateCommercialInventory();return privateJson({id:input.id,status:input.status});
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
  try{inspectCreative(input.content,input.mime!);}catch(cause){return error(cause instanceof Error?cause.message:'Imagen inválida.',400);}
  const mime=input.mime;
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
  return recordCampaignMetric('growth_house',campaign.id,a.creativeId!,event,effectId,'HOUSE_AD');
}
async function recordCampaignMetric(prefix:'growth_house'|'growth_commercial',campaignId:string,creativeId:string,event:HouseEvent,effectId:string,type:string){
  const day=new Date().toISOString().slice(0,10);const id=digest(campaignId+':'+creativeId+':'+day);
  const receipt=digest((prefix==='growth_house'?'':campaignId+':')+event+':'+effectId);
  const table=prefix+'_events';
  const [prior]=await db.get(table,[receipt],{consistent:true});
  if(prior)return true;
  await db.tx.add(prefix+'_metrics',[{id,day,campaignId:campaignId,creativeId:creativeId,type,impression:0,click:0,form_started:0,registration_completed:0,profile_published:0,employer_added:0,advertiser_captured:0,trial_activated:0,paid_conversion:0}]);
  try{
    await db.transact([
      db.tx.add(table,[{id:receipt,event,type,createdAt:new Date().toISOString()}]),
      db.tx.update(prefix+'_metrics',[{id,record:{[event]:increment(1)}}],{patch:true}),
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

export async function commercialClientEvent(ctx:RouterContext){
  const input=ctx.body as {campaignId?:string;event?:string;eventId?:string;place?:string;placement?:string};
  if(!input||!['impression','click'].includes(input.event||'')||typeof input.campaignId!=='string'||input.campaignId.length>150||!/^[-a-zA-Z0-9]{16,80}$/.test(input.eventId||'')||!['search','listing'].includes(input.placement||''))return error('Evento inválido.',400);
  const [campaign]=await db.get<CommercialAd>('growth_campaigns',[input.campaignId]);
  const now=Date.now();
  if(!campaign||campaign.status!=='active'||!Number.isFinite(Date.parse(campaign.startAt))||Date.parse(campaign.startAt)>now||!Number.isFinite(Date.parse(campaign.endAt))||Date.parse(campaign.endAt)<=now||!campaign.communes?.some(p=>p==='Todas'||p===input.place)||!(campaign.placements??['search','listing']).includes(input.placement as 'search'|'listing'))return error('Campaña no elegible.',400);
  const received=await recordCampaignMetric('growth_commercial',input.campaignId,input.placement!,input.event as HouseEvent,input.eventId!,campaign.adType||'COMMERCIAL_LEGACY');
  return json({received,billing:false},202);
}
export async function commercialMetrics(ctx:RouterContext){
  const page=await db.list('growth_commercial_metrics',{limit:50,...(ctx.query.cursor?{nextToken:ctx.query.cursor}:{})});
  return privateJson({items:page.items,nextToken:page.nextToken||null,billing:false,source:'first_party_browser_reports'});
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
  if(lead.advertisingConsent!==true)return error('La solicitud no acredita autorización publicitaria. No se activa.',409);
  if(!COMMERCIAL_PLACES.includes(lead.commune))return error('Comuna fuera de cobertura comercial.',400);
  if(!businessIdentity(String(lead.businessName||'')))return error('Identifica el negocio.',400);
  const key=digest(businessIdentity(lead.businessName));
  const campaignId='trial-'+digest(input.leadId);
  const reconcile=async()=>{
    const [receipt]=await db.get('growth_trial_entitlements',[key],{consistent:true});
    if(!receipt)return null;
    return receipt.leadId===input.leadId?privateJson({id:receipt.campaignId,duplicate:true,startAt:receipt.startAt,endAt:receipt.endAt,promotion:receipt.promotion}):error('Este negocio ya recibió su promoción gratuita. No son acumulables.',409);
  };
  const prior=await reconcile();if(prior)return prior;
  // Protect legacy trials from being renewed through the new programme.
  const [existing]=await db.get('growth_campaigns',[campaignId],{consistent:true});
  if(existing)return privateJson({id:campaignId,duplicate:true,startAt:existing.startAt,endAt:existing.endAt});
  const legacy=(await commercialInventory()).some(ad=>(ad.adType==='COMMERCIAL_FREE'||ad.id.startsWith('trial-'))&&businessIdentity(ad.businessName)===businessIdentity(lead.businessName));
  if(legacy)return error('El negocio ya tiene una promoción histórica; requiere revisión, no otra prueba gratuita.',409);
  for(let attempt=0;attempt<3;attempt++){
    const config=await commercialConfiguration();const offer=promotionOffer(config);
    if(!offer.days||config.revision==='commercial-defaults-v1')return error('Configura y aprueba explícitamente el lanzamiento antes de activar promociones.',409);
    const startAt=new Date().toISOString();const endAt=new Date(Date.parse(startAt)+offer.days*86400000).toISOString();
    const record={id:campaignId,advertiserId:key,promotion:offer.kind,adType:'COMMERCIAL_FREE',businessName:lead.businessName,category:lead.category,communes:[lead.commune],headline:input.headline.trim(),detail:input.detail.trim(),url:input.url||undefined,startAt,endAt,status:'active',label:'Publicidad local',priority:0,placements:['search'],createdAt:startAt};
    try{
      await db.transact([
        db.tx.add('growth_trial_entitlements',[{id:key,leadId:input.leadId,campaignId,startAt,endAt,promotion:offer.kind,days:offer.days,createdAt:startAt}]),
        db.tx.add('growth_campaigns',[record]),
        db.tx.update('growth_advertiser_leads',[{id:input.leadId,record:{advertiserId:key,trialCampaignId:campaignId,trialState:'active',trialStartAt:startAt,trialEndAt:endAt,promotion:offer.kind},if:{trialCampaignId:undefined}}],{patch:true}),
        db.tx.update('growth_commercial_config',[{id:'current',record:{foundersUsed:config.foundersUsed+(offer.kind==='founder'?1:0)},if:{revision:config.revision,foundersUsed:config.foundersUsed}}],{patch:true}),
        db.tx.add('growth_commercial_audit',[{id:randomUUID(),action:'trial_approved',campaignId,actor:ctx.user?.userId,promotion:offer.kind,at:startAt}]),
      ]);
    }catch(cause){
      if(isAppDatabaseError(cause)&&['AppDatabaseDuplicateId','AppDatabaseConditionFailed','AppDatabaseConflict','AppDatabaseUnknownOutcome'].includes(cause.code)){
        const recovered=await reconcile();if(recovered)return recovered;
        if(cause.code==='AppDatabaseUnknownOutcome')return error('Resultado pendiente de confirmación. Comprueba antes de repetir.',409);
        continue;
      }throw cause;
    }
    invalidateCommercialInventory();await houseConversion(lead.houseAttribution,'trial_activated',campaignId);
    return privateJson({id:campaignId,startAt,endAt,promotion:offer.kind,days:offer.days},201);
  }
  return error('Otra aprobación está en curso; recarga y vuelve a comprobar.',409);
}
