// Read-only observation of the deployed React application through its real SDK.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const out='qa-output/radar-live'; mkdirSync(out,{recursive:true});
const towns=['Angol','Collipulli','Ercilla','Renaico','Mininco','Nacimiento','Negrete','Mulchén','Los Sauces','Purén','Traiguén','Lumaco','Victoria'];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome'});
const report={observedAt:new Date().toISOString(),readOnly:true,syntheticRecords:0,errors:[],proofs:{},territorial:{}};
const networkItems=new Map(),networkReads=[];
function extract(v,depth=0) {
 if(!v||depth>12)return;
 if(typeof v==='string'){if(/^[\[{]/.test(v.trim())){try{extract(JSON.parse(v),depth+1);}catch{}}return;}
 if(typeof v!=='object')return;
 if(Array.isArray(v.items))for(const item of v.items)if(item?.id&&item.kind)networkItems.set(item.id,{
   id:item.id,documentUnitKey:item.documentUnitKey,documentUnitVerified:item.documentUnitVerified,
   sourcePublishedAt:item.sourcePublishedAt,sourceValidThrough:item.sourceValidThrough,applicationUrl:item.applicationUrl});
 for(const [key,value]of Object.entries(v))if(key!=='items')extract(value,depth+1);
}
const root='https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/';
try {
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.route('**/*',route=>{const req=route.request();if(!['GET','HEAD'].includes(req.method())&&/house-events|commercial-events|growth\/events|sponsor-impression|analytics/i.test(req.url()+' '+(req.postData()||'')))return route.abort();return route.continue();});
 const page=await context.newPage();
 page.on('response',r=>{if((r.headers()['content-type']||'').includes('json'))networkReads.push(r.json().then(v=>extract(v)).catch(()=>{}));});
 page.on('pageerror',e=>report.errors.push(e.message));
 for(const [mode,id] of [['radar-proof','radar-live-check'],['radar-public-proof','radar-public-check']]){
  try {await page.goto(root+'?'+mode+'=1#operacion',{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForFunction(id=>{try{const v=JSON.parse(document.getElementById(id)?.textContent||'null');return v&&(v.checkedAt||v.state);}catch{return false;}},id,{timeout:75000});
   report.proofs[mode]=JSON.parse(await page.locator('#'+id).textContent());
   await page.screenshot({path:out+'/'+mode+'.png',fullPage:true});
  }catch(e){report.errors.push(mode+': '+e.message);}
 }
 try {
  await page.goto(root,{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('[data-offer-id]').first().waitFor({timeout:75000});
  await page.waitForFunction(()=>document.querySelector('#neo-jobs')?.getAttribute('aria-busy')==='false'&&!document.querySelector('.neoLoadMore'),null,{timeout:45000});
  for(const town of towns){
   let select;
   for (const candidate of await page.locator('select:visible').all()) {
     if (await candidate.locator('option').evaluateAll((es,t)=>es.some(e=>e.textContent===t),town)) {select=candidate;break;}
   }
   if (!select) throw new Error('No visible territorial selector; DOM not verified');
   await select.selectOption({label:town});
   await page.waitForTimeout(400); const ids=new Set();
   for(let i=0;i<40;i++){
    for(const id of await page.locator('[data-offer-id]').evaluateAll(es=>es.map(e=>e.getAttribute('data-offer-id'))))ids.add(id);
    const next=page.getByRole('button',{name:'Siguiente página',exact:true});
    if(!await next.count()||!await next.isVisible()||!await next.isEnabled())break;
    await next.click();await page.waitForTimeout(150);
   }
   report.territorial[town]=[...ids];
  }
  await page.screenshot({path:out+'/public-mobile.png',fullPage:true});
 }catch(e){report.errors.push('territorial: '+e.message);}
 await Promise.all(networkReads);
 const proof=report.proofs['radar-proof'];
 report.publicItems=(proof?.visibleItems||[]).map(x=>({...x,...networkItems.get(x.id)}));
 report.territorialExpected=Object.fromEntries(towns.map(t=>[t,(proof?.visibleItems||[]).filter(x=>x.kind==='job_offer'&&x.workCommunes?.includes(t)).map(x=>x.id)]));
 report.territorialMismatch=towns.filter(t=>report.territorial[t]?.length!==report.territorialExpected[t].length||report.territorialExpected[t].some(id=>!report.territorial[t]?.includes(id)));
 report.complete=Boolean(proof?.feedReadComplete)&&report.territorialMismatch.length===0;
 writeFileSync(out+'/baseline.json',JSON.stringify(report,null,2));
 console.log('RADAR_BASELINE_JSON '+JSON.stringify(report));
 console.log(JSON.stringify({complete:report.complete,visibleItems:proof?.visibleItems?.length,territorial:Object.fromEntries(Object.entries(report.territorial).map(([t,ids])=>[t,ids.length])),errors:report.errors}));
 if(!report.complete)process.exitCode=1;
}finally{await browser.close();}
