import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const dir=path.resolve('qa/captures-hotfix');fs.mkdirSync(dir,{recursive:true});
let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)};
try{
 for(const width of [320,360,390,412,768,1440]){
  const ctx=await browser.newContext({viewport:{width,height:850},serviceWorkers:'block',reducedMotion:'reduce'});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded',timeout:20000});
   await page.locator('.tcStitchShell').waitFor({state:'visible',timeout:12000});
   const consent=page.getByRole('button',{name:'No aceptar'});
   if(await consent.isVisible().catch(()=>false))await consent.click();
   await test(width+'px no pause buttons',async()=>{
     assert.equal(await page.getByRole('button',{name:/Pausar carrusel|Reanudar campañas|Ver campañas/}).count(),0);
   });
   const house=page.locator('.tcInlineHousePromo[data-ad-type="HOUSE_AD"], .tcInlineHousePromo[data-house-kind]').first();
   await house.waitFor({state:'visible',timeout:10000});
   await test(width+'px own ad has a loaded illustration',async()=>{
     const photo=house.locator('.tcHouseFallbackThumb');
     await photo.waitFor({state:'attached'});
     await photo.evaluate(img=>img.decode().catch(()=>undefined));
     assert((await photo.evaluate(img=>img.naturalWidth))>0,'Official local illustration failed loading');
     const r=await house.boundingBox();assert(r&&r.width<=width+2,'Promo exceeds viewport');
   });
   const radar=page.locator('.tcRadarCompactRegion .tcTerritorialRadar');
   await test(width+'px territorial radar present',async()=>assert.equal(await radar.count(),1));
   const details=radar.locator('.tcRadarDetails');
   if(!await details.evaluate(el=>el.open))await details.locator(':scope > summary').click();
   const names=radar.locator('.tcRadarTowns button span');
   await test(width+'px 12 labels fit their own boxes',async()=>{
     assert.equal(await names.count(),12);
     const data=await names.evaluateAll(elements=>elements.map(el=>{
       const a=el.getBoundingClientRect(),b=el.parentElement.getBoundingClientRect();
       return{name:el.textContent,scroll:el.scrollWidth,client:el.clientWidth,right:a.right,buttonRight:b.right}
     }));
     for(const row of data)assert(row.scroll<=row.client+2 && row.right<=row.buttonRight+3,'Radar label overflow: '+JSON.stringify(row));
     assert(data.some(x=>x.name==='Nacimiento'));
   });
   const footer=page.locator('details.tcStitchFooterDetails');
   if(!await footer.evaluate(el=>el.open))await footer.locator(':scope > summary').click();
   await test(width+'px footer shows official logo and legal choices',async()=>{
     assert(await footer.locator('.tcFooterBrand').isVisible());
     assert.equal(await footer.locator('.tcFooterLegal button').count(),3);
     const img=footer.locator('.tcFooterBrand img');await img.evaluate(node=>node.decode().catch(()=>undefined));
     assert((await img.evaluate(node=>node.naturalWidth))>0);
   });
   await test(width+'px no global scroll overflow or JS errors',async()=>{
     const dims=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
     assert(dims.scroll<=dims.width+2,JSON.stringify(dims));
     assert.deepEqual(errors,[]);
   });
   if(width===390){
     await page.screenshot({path:path.join(dir,'radar-footer-390.png'),fullPage:true,animations:'disabled'});
     await page.locator('.tcRadarDetails').evaluate(el=>el.open=false);
     await footer.evaluate(el=>el.open=false);
     await page.screenshot({path:path.join(dir,'campaign-390.png'),fullPage:true,animations:'disabled'});
   }
  }finally{await ctx.close()}
 }
}finally{await browser.close()}
console.log('HOTFIX_CHROMIUM '+passed+' checks passed');
