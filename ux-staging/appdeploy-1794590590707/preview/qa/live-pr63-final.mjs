import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const base='https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const capture=path.resolve('qa/captures-live-pr63');fs.mkdirSync(capture,{recursive:true});
let passed=0;
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)};
try{
 for(const width of [320,390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:860},serviceWorkers:'block',reducedMotion:'reduce'});
  const page=await context.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try{
   await page.goto(base,{waitUntil:'domcontentloaded',timeout:35000});
   await page.locator('.tcStitchShell').waitFor({state:'visible',timeout:25000});
   const consent=page.getByRole('button',{name:'No aceptar'});
   if(await consent.isVisible().catch(()=>false))await consent.click();
   await check(width+'px frontend mounts',async()=>assert.equal(await page.locator('.tcStitchShell').count(),1));
   await check(width+'px default geographic filter Todas',async()=>assert.equal(await page.locator('.tcMobilePlace select').inputValue(),'Todas'));
   const offer=page.locator('[data-offer-id]').first();
   await offer.waitFor({state:'visible',timeout:25000});
   await check(width+'px catalog shows real job IDs',async()=>assert((await offer.getAttribute('data-offer-id')).length>2));
   const place=page.locator('.tcWorkplaceLabel').filter({hasText:/Lumaco|Imperial/}).first();
   if(await place.count()){
    await check(width+'px job place tag contains only short place',async()=>{
      const text=(await place.textContent())||'';
      assert(text.length<=35 && !/Operaciones de transporte|Tienda Upa!/i.test(text),text);
    });
   }
   await check(width+'px radar and legal remain available',async()=>{
     assert.equal(await page.locator('.tcRadarCompactRegion .tcTerritorialRadar').count(),1);
     assert.equal(await page.locator('details.tcStitchFooterDetails').count(),1);
   });
   await check(width+'px no horizontal overflow',async()=>{
     const m=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
     assert(m.scroll<=m.viewport+2,JSON.stringify(m));
   });
   const promos=page.locator('.tcInlineHousePromo');
   if(await promos.first().isVisible().catch(()=>false)){
     await check(width+'px in-feed house card uses compact premium layout',async()=>{
       const first=promos.first(),rect=await first.boundingBox();
       assert(rect&&rect.width<=width+3,'own ad exceeds viewport');
       assert((await first.locator('.tcInlineHouseCopy strong').textContent()).length>8);
       assert(await first.getByRole('button',{name:/Pausar campañas/}).count()===1);
     });
   }
   if(width===390)await page.screenshot({path:path.join(capture,'home-390.png'),fullPage:true,animations:'disabled'});
   if(width<=390){
     const nav=page.getByRole('navigation',{name:'Navegación móvil de cuatro espacios'});
     await nav.getByRole('button',{name:'Directorio'}).click();
     const dir=page.locator('#local-directory');await dir.locator('.tcDirectoryTop').waitFor({state:'visible',timeout:9000});
     const listing=dir.locator('.tcDirectoryCard').filter({hasText:'Tortas'}).first();
     await listing.waitFor({state:'visible',timeout:15000});
     await check(width+'px approved Tortas remains in public directory',async()=>{
       assert((await listing.textContent()).includes('Renaico'));
     });
     await listing.getByRole('button',{name:/Ampliar fotografía 1 de Tortas/}).click();
     const zoom=page.getByRole('dialog',{name:/Fotografías de Tortas/});await zoom.waitFor({state:'visible'});
     await check(width+'px real Tortas photo enlarges and closes',async()=>{
       assert(await zoom.locator('img').isVisible());
       await zoom.getByRole('button',{name:'Cerrar fotografía'}).click();
       await zoom.waitFor({state:'detached'});
     });
     await listing.getByRole('button',{name:/Calificar servicio/}).click();
     const review=listing.locator('.tcDirectoryReviewForm');await review.waitFor({state:'visible'});
     await check(width+'px ratings show 5 stars and sign-in only to submit',async()=>{
       assert.equal(await review.getByRole('radio').count(),5);
       assert(await review.getByRole('button',{name:'Confirmar mi correo para opinar'}).isVisible());
       assert(!await review.getByRole('button',{name:'Enviar calificación'}).isEnabled());
     });
     if(width===390)await page.screenshot({path:path.join(capture,'directory-stars-390.png'),fullPage:true,animations:'disabled'});
   }
   await check(width+'px no Javascript exceptions',async()=>assert.deepEqual(errors,[]));
  }finally{await context.close();}
 }
}finally{await browser.close();}
console.log('PR63_PUBLIC_SMOKE '+passed+' checks passed; read only');
