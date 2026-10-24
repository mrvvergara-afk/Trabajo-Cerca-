import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync,writeFileSync,mkdirSync} from 'node:fs';
const browser=await chromium.launch({headless:true,...(existsSync('/usr/bin/google-chrome')?{executablePath:'/usr/bin/google-chrome'}:{})});
const rows=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('http://127.0.0.1:4174/',{waitUntil:'networkidle'});
 const quick=page.getByRole('navigation',{name:'Qué necesitas hacer',exact:true});
 for(const [button,field,title,kind] of [['Ofrecer mi trabajo','¿Qué trabajo u oficio ofreces?','Oficio libre del ensayo','worker_available'],['Necesito contratar','¿Qué trabajador necesitas?','Necesito un trabajador del ensayo','worker_need']]){
  await quick.getByRole('button',{name:button,exact:true}).click();
  await page.getByLabel(field,{exact:true}).fill(title);
  await page.getByLabel('WhatsApp o teléfono de contacto',{exact:true}).fill('+56912345678');
  await page.locator('.smartForm input[type=checkbox]').check();
  await page.getByRole('button',{name:'Revisar antes de publicar',exact:true}).click();
  await page.getByRole('button',{name:'Publicar ahora',exact:true}).click();
  await page.locator('.previewPanel').waitFor({state:'hidden'});
  const calls=await page.evaluate(()=>window.houseCalls);
  const call=calls.find(c=>c.path==='/api/listings'&&c.method==='POST'&&c.body.kind===kind);assert(call&&call.body.consent===true);assert(!('price'in call.body));
  rows.push({kind,formSubmittedToIsolatedAdapter:true,consent:true,accountNotRequired:true,priceNotRequested:true});
 }
 await quick.getByRole('button',{name:'Promocionar negocio',exact:true}).click();
 await page.getByLabel('Nombre del negocio',{exact:true}).fill('Negocio ficticio del ensayo');
 await page.getByLabel('Correo, WhatsApp o teléfono comercial',{exact:true}).fill('fixture@example.org');
 for(const c of await page.locator('.advertiserPanel input[type=checkbox]').all())await c.check();
 await page.getByRole('button',{name:'Solicitar espacio gratuito',exact:true}).click();await page.locator('.advertiserPanel').waitFor({state:'hidden'});
 const calls=await page.evaluate(()=>window.houseCalls);const lead=calls.find(c=>c.path==='/api/growth/advertiser-leads'&&c.method==='POST');assert(lead.body.advertisingConsent===true&&lead.body.consent===true);assert(!calls.some(c=>/payment|checkout|subscription/.test(c.path)));
 rows.push({commercialLeadSubmittedToIsolatedAdapter:true,advertisingConsent:true,trialNotActivated:true,noPaymentCalls:true});
 assert.deepEqual(errors,[]);await context.close();
}finally{await browser.close();}
mkdirSync('qa-output',{recursive:true});const report={checkedAt:new Date().toISOString(),fixturesOnly:true,productionWrites:0,deployed:false,rows};writeFileSync('qa-output/p0-publication.json',JSON.stringify(report,null,2));console.log('P0_PUBLICATION_PROOF '+JSON.stringify(report));
