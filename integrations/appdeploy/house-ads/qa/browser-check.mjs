import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync,existsSync} from 'node:fs';
const browser=await chromium.launch({headless:true,...(existsSync('/usr/bin/google-chrome')?{executablePath:'/usr/bin/google-chrome'}:{})});
const results=[];
try{
 for(const viewport of [{width:390,height:844},{width:1440,height:1000}]){
  const context=await browser.newContext({viewport});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('BROWSER_ERROR '+e.message);});
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.addInitScript(()=>{sessionStorage.setItem('tc-house-turn','-1');});
  await page.goto('http://127.0.0.1:4174/',{waitUntil:'networkidle'});
  const banner=page.locator('[data-ad-type="HOUSE_AD"]');await banner.first().waitFor();assert.equal(await banner.count(),1);
  await page.getByRole('button',{name:'Publicar mis servicios',exact:true}).first().click();
  await page.getByRole('heading',{name:'Ofrezco mi trabajo',exact:true}).waitFor();
  await page.getByRole('button',{name:'Cerrar',exact:true}).last().click();
  assert.equal(await page.getByRole('heading',{name:'Ofrezco mi trabajo',exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.equal(await page.locator('[data-ad-type="HOUSE_AD"] a').count(),0);
  const calls=await page.evaluate(()=>window.houseCalls);
  assert(calls.some(c=>c.path==='/api/growth/house-events'&&c.body.event==='click'));
  assert(calls.some(c=>c.path==='/api/growth/house-events'&&c.body.event==='form_started'));
  assert(!calls.some(c=>c.path==='/api/listings'&&c.method==='POST'));
  assert.deepEqual(errors,[]);results.push({viewport,zeroAdvertisers:true,zeroProfiles:true,realProfessionalFormOpened:true,formNotSubmitted:true,noHorizontalOverflow:true,consoleErrors:errors});
  await context.close();
 }
 const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.addInitScript(()=>{sessionStorage.setItem('tc-house-turn','0');});
 await page.goto('http://127.0.0.1:4174/',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'Publicitar mi negocio',exact:true}).first().click();
 await page.getByRole('heading',{name:'Solicita tus 30 días de publicidad gratis',exact:true}).waitFor();
 assert((await page.locator('.advertiserPanel').innerText()).includes('desde la aprobación'));results.push({advertiserFormReal:true,trialNotFalselyActivated:true});await context.close();
 const admin=await browser.newContext({viewport:{width:390,height:844}});const ap=await admin.newPage();
 await ap.addInitScript(()=>{window.houseFixture='admin';});await ap.goto('http://127.0.0.1:4174/qa/marketing.html',{waitUntil:'networkidle'});
 await ap.getByLabel('Estado',{exact:true}).selectOption('paused');await ap.getByRole('button',{name:'Guardar campañas propias',exact:true}).click();
 await ap.getByText('Campañas guardadas. La configuración se aplicará en las siguientes visitas.',{exact:true}).waitFor();
 assert.equal(await ap.getByLabel('Estado',{exact:true}).inputValue(),'paused');
 assert.equal(await ap.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 results.push({administrationLocalFixture:true,pauseSavedThroughAdapter:true,noHorizontalOverflow:true});await admin.close();
}finally{await browser.close();}
mkdirSync(process.env.HOUSE_QA_OUTPUT||'qa-output',{recursive:true});
const report={checkedAt:new Date().toISOString(),fixturesOnly:true,productionWrites:0,deployed:false,views:results};
writeFileSync((process.env.HOUSE_QA_OUTPUT||'qa-output')+'/house-browser.json',JSON.stringify(report,null,2));console.log('HOUSE_BROWSER_PROOF '+JSON.stringify(report));
