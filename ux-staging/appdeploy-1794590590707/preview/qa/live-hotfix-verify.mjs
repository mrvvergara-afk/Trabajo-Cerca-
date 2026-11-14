import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const url='https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let n=0;const check=async(name,fn)=>{await fn();n++;console.log('PASS '+name);};
try{
 for(const width of [320,390,412]){
  const ctx=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('tc_analytics_consent','no'));
  try{
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:35000});
   await page.locator('.tcStitchShell').waitFor({state:'visible',timeout:25000});
   await check(width+'px public app mounts and still has job offers',async()=>{
     await page.locator('[data-offer-id]').first().waitFor({state:'visible',timeout:25000});
     assert((await page.locator('[data-offer-id]').count())>0);
   });
   await check(width+'px no play/pause controls',async()=>{
     assert.equal(await page.getByRole('button',{name:/Pausar carrusel|Reanudar campañas|Ver campañas/}).count(),0);
   });
   const radar=page.locator('.tcRadarCompactRegion .tcTerritorialRadar');
   await radar.waitFor({state:'attached',timeout:18000});
   const details=radar.locator('.tcRadarDetails');
   if(!await details.evaluate(e=>e.open))await details.evaluate(e=>{e.open=true;});
   await check(width+'px all 12 municipality labels fit their cards',async()=>{
     const rows=await radar.locator('.tcRadarTowns button span').evaluateAll(els=>els.map(el=>{
       const a=el.getBoundingClientRect(),b=el.parentElement.getBoundingClientRect();
       return{name:el.textContent,scroll:el.scrollWidth,client:el.clientWidth,right:a.right,buttonRight:b.right};
     }));
     assert.equal(rows.length,12);
     for(const row of rows)assert(row.scroll<=row.client+2&&row.right<=row.buttonRight+3,'Overflow '+JSON.stringify(row));
   });
   const footer=page.locator('details.tcStitchFooterDetails');
   if(!await footer.evaluate(e=>e.open))await footer.evaluate(e=>{e.open=true;});
   await check(width+'px branded privacy footer works',async()=>{
     assert(await footer.locator('.tcFooterBrand').isVisible());
     assert.equal(await footer.locator('.tcFooterLegal button').count(),3);
   });
   await check(width+'px no viewport overflow or script errors',async()=>{
     const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,view:innerWidth}));
     assert(size.scroll<=size.view+2,JSON.stringify(size));assert.deepEqual(errors,[]);
   });
  }finally{await ctx.close();}
 }
}finally{await browser.close();}
console.log('HOTFIX_LIVE '+n+' checks passed');
