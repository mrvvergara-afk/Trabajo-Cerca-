// Read-only observation of the deployed React application through its real SDK.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const out='qa-output/radar-live'; mkdirSync(out,{recursive:true});
const towns=['Angol','Collipulli','Ercilla','Renaico','Mininco','Nacimiento','Negrete','Mulchén','Los Sauces','Purén','Traiguén','Lumaco','Victoria'];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome'});
const report={observedAt:new Date().toISOString(),readOnly:true,syntheticRecords:0,errors:[],proofs:{},territorial:{}};
const root='https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/';
try {
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.route('**/*',route=>{const req=route.request();if(!['GET','HEAD'].includes(req.method())&&/house-events|commercial-events|growth\/events|sponsor-impression|analytics/i.test(req.url()+' '+(req.postData()||'')))return route.abort();return route.continue();});
 const page=await context.newPage(); page.on('pageerror',e=>report.errors.push(e.message));
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
  for(const town of towns){
   const select=page.getByLabel('Comuna de cabecera',{exact:true}); await select.selectOption({label:town});
   await page.waitForTimeout(400); const ids=new Set();
   for(let i=0;i<40;i++){
    for(const id of await page.locator('[data-offer-id]').evaluateAll(es=>es.map(e=>e.getAttribute('data-offer-id'))))ids.add(id);
    const more=page.getByRole('button',{name:'Cargar más',exact:true});if(!await more.count()||!await more.isVisible())break;
    await more.click();await page.waitForTimeout(300);
   }
   report.territorial[town]=[...ids];
  }
  await page.screenshot({path:out+'/public-mobile.png',fullPage:true});
 }catch(e){report.errors.push('territorial: '+e.message);}
 const proof=report.proofs['radar-proof']; report.complete=Boolean(proof?.feedReadComplete)&&towns.every(t=>Array.isArray(report.territorial[t]));
 writeFileSync(out+'/baseline.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({complete:report.complete,visibleItems:proof?.visibleItems?.length,territorial:Object.fromEntries(Object.entries(report.territorial).map(([t,ids])=>[t,ids.length])),errors:report.errors}));
 if(!report.complete)process.exitCode=1;
}finally{await browser.close();}
