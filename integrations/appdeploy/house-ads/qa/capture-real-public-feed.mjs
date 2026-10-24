// Read-only: use the deployed public UI and its existing SDK. Never invoke ops,
// collectors, forms, contact reveals, authentication or campaign writes.
import {chromium} from 'playwright';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
mkdirSync('qa-output/visual-review',{recursive:true});
const browser=await chromium.launch({headless:true,...(existsSync('/usr/bin/google-chrome')?{executablePath:'/usr/bin/google-chrome'}:{})});
const fields=['id','kind','origin','title','company','salary','workLocation','workCommunes','recruitmentZones','recruitmentCommunes','area','status','date','source','sourceDomain','url','note','tags','visual','icon','review','verified','active','createdAt','firstPublishedAt','sourcePublishedAt','lastVerifiedAt','verifiedAt','externalVerifiedAt','verificationMethod','verificationReason','revalidationDue','expiresAt','closedAt','hasContact','contactLabel','originalPosterUrl'];
const rows=new Map(),pending=[],metrics=[],errors=[],networkErrors=[];let metadata={};
function extract(value,depth=0){if(depth>12||!value)return;if(typeof value==='string'){if(value.length<6000000&&/^[\[{]/.test(value.trim())){try{extract(JSON.parse(value),depth+1);}catch{}}return;}if(typeof value!=='object')return;
 if(Array.isArray(value.items)&&value.items.some(x=>x?.id&&x.kind)){
  for(const item of value.items){if(!item?.id||!item.kind)continue;rows.set(item.id,Object.fromEntries(fields.filter(k=>item[k]!==undefined).map(k=>[k,item[k]])));}
  for(const key of ['totalItems','totalJobOffers','totalVerifiedJobOffers','totalProvisionalJobOffers','recentJobOffers7d','kindStats','communeStats','feedState','state','updatedAt','manifestId'])if(value[key]!==undefined)metadata[key]=value[key];
 }
 for(const [key,child] of Object.entries(value))if(key!=='items')extract(child,depth+1);
}
try{
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage();
 await context.route('**/*',route=>{const req=route.request(),body=req.postData()||'',url=req.url();if(req.method()!=='GET'&&req.method()!=='HEAD'&&/house-events|commercial-events|growth\/events|sponsor-impression|analytics/i.test(body+' '+url)){metrics.push('measurement request blocked');return route.abort();}return route.continue();});
 page.on('response',r=>{if(r.status()>=500)networkErrors.push({url:r.url().split('?')[0],status:r.status()});if((r.headers()['content-type']||'').includes('json'))pending.push((async()=>{try{const j=await r.json();const inspect=(v,depth=0)=>{if(depth>12||!v||typeof v!=='object')return;for(const [key,value] of Object.entries(v)){if(['status','statusCode','httpStatus'].includes(key)&&Number(value)===503)networkErrors.push({url:r.url().split('?')[0],transportStatus:r.status(),sdkStatus:503});else if(typeof value==='object')inspect(value,depth+1);}};inspect(j);extract(j);}catch{}})());});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/',{waitUntil:'domcontentloaded',timeout:45000});
 await page.locator('.neoJobCard').first().waitFor({timeout:90000});
 await page.waitForFunction(()=>{const x=document.querySelector('#neo-jobs');return x&&x.getAttribute('aria-busy')==='false'&&!document.querySelector('.tcActivityStrip small');},{},{timeout:90000});
 for(let i=0;i<12;i++){const more=page.getByRole('button',{name:'Cargar más',exact:true});if(!await more.count())break;await more.click();await page.waitForTimeout(1200);}
 await page.waitForTimeout(1200);await Promise.all(pending);
 assert(Number.isInteger(metadata.totalItems),'No full SDK totals received');assert.equal(rows.size,metadata.totalItems,'incomplete real public feed; do not replace with fixtures');assert(rows.size>0);
 const items=[...rows.values()],jobs=items.filter(x=>x.kind==='job_offer');assert.equal(jobs.length,metadata.totalJobOffers);
 const snapshot={...metadata,items,nextCursor:null,reviewProvenance:{readOnly:true,source:'deployed app public UI and existing SDK responses',observedAt:new Date().toISOString(),sdkMutation:false,syntheticRecords:0,measurementRequestsSuppressed:metrics.length,sourceErrors:errors,networkErrors}};
 snapshot.reviewProvenance.itemsSha256=createHash('sha256').update(JSON.stringify(items)).digest('hex');
 writeFileSync('qa-output/visual-review/public-feed.json',JSON.stringify(snapshot,null,2));
 for(const width of [360,390,430,1440]){await page.setViewportSize({width,height:width<800?844:1000});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`qa-output/visual-review/live-before-${width}-first.png`});const geometry=await page.evaluate(()=>{const b=s=>{const e=document.querySelector(s);return e?{top:e.getBoundingClientRect().top,height:e.getBoundingClientRect().height}:null;};return {header:b('.neoTopbar'),hero:b('.neoHero'),strip:b('.tcActivityStrip'),catalog:b('#neo-jobs'),firstCard:b('.neoJobCard')};});writeFileSync(`qa-output/visual-review/live-before-${width}.json`,JSON.stringify(geometry,null,2));}
 console.log('REAL_PUBLIC_FEED_READ '+JSON.stringify({count:items.length,jobs:jobs.length,syntheticRecords:0,readOnly:true,sha256:snapshot.reviewProvenance.itemsSha256}));
 await context.close();
}catch(error){writeFileSync('qa-output/visual-review/capture-failure.json',JSON.stringify({message:String(error),networkErrors,errors,observedRows:rows.size,metadata},null,2));throw error;}finally{await browser.close();}
