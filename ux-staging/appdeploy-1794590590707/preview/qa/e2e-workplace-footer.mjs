import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const root=path.resolve('qa/captures-footer');fs.mkdirSync(root,{recursive:true});
let tests=0;const pass=async(name,fn)=>{await fn();tests++;console.log('PASS '+name)};
try{
 for(const width of [320,360,390,412,768,1440]){
  const context=await browser.newContext({viewport:{width,height:840},reducedMotion:'reduce',serviceWorkers:'block'});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded',timeout:20000});
   await page.locator('.tcStitchShell').waitFor({state:'visible',timeout:10000});
   const radar=page.locator('.tcRadarCompactRegion .tcTerritorialRadar');
   await pass(width+'px radar exists',async()=>assert.equal(await radar.count(),1));
   await pass(width+'px single 12-commune radar toggle',async()=>{
    assert.equal(await radar.locator('.tcRadarDetails > summary').count(),1);
    assert(/12 comunas|Ocultar las comunas/.test((await radar.locator('.tcRadarDetails > summary').textContent())||''));
   });
   const footer=page.locator('details.tcStitchFooterDetails');
   await pass(width+'px legal section is separate',async()=>{
    assert.equal(await footer.count(),1);
    assert.equal(await footer.locator(':scope > summary').textContent(),'Información y privacidad');
    assert.equal(await footer.locator('button').count(),3);
   });
   const news=page.locator('#actualidad-laboral');
   await pass(width+'px news only website desktop',async()=>{
    if(width<=767)assert.equal(await news.isVisible(),false);
    else assert.equal(await news.isVisible(),true);
   });
   if(width<=767){
    await pass(width+'px closed legal section at first paint',async()=>{
      assert.equal(await footer.evaluate(e=>e.hasAttribute('open')),false);
    });
   }
   const sample=await page.evaluate(()=>{
     const card=document.createElement('article');
     card.className='neoJobCard';
     const body=document.createElement('div');body.className='neoJobBody';
     const placeWrap=document.createElement('div');placeWrap.className='neoJobTop';
     const badge=document.createElement('span');badge.className='neoJobPlace';
     badge.innerHTML='<svg width="12" height="12" aria-hidden="true"></svg><span class="tcWorkplaceLabel">Lumaco / Imperial</span>';
     placeWrap.append(badge);body.append(placeWrap);card.append(body);
     card.style.cssText='position:absolute;left:10px;top:10px;width:300px;visibility:hidden;';
     document.querySelector('.tcStitchShell').append(card);
     const box=badge.getBoundingClientRect(),label=badge.querySelector('span').getBoundingClientRect();
     const out={width:box.width,labelWidth:label.width,labelScroll:badge.querySelector('span').scrollWidth,labelClient:badge.querySelector('span').clientWidth};
     card.remove();return out;
   });
   await pass(width+'px sample two-commune badge does not overflow',async()=>{
    assert(sample.width<=(width<=767?118:180),JSON.stringify(sample));
    assert(sample.labelScroll<=sample.labelClient+2,JSON.stringify(sample));
   });
   const dims=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
   await pass(width+'px no global overflow or JS error',async()=>{
    assert(dims.scroll<=dims.viewport+2,JSON.stringify(dims));
    assert.deepEqual(errors,[]);
   });
   if(width===390)await page.screenshot({path:path.join(root,'radar-footer-390.png'),fullPage:true,animations:'disabled'});
  }catch(error){console.error('FAIL viewport '+width+' '+String(error));throw error;}finally{await context.close();}
 }
}finally{await browser.close();}
console.log('RADAR_FOOTER_BROWSER '+tests+' passed');
