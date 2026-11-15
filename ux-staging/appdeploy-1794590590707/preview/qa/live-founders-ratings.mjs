import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const BASE='https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let passed=0;const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
try{
 for(const width of [320,390,768]){
  const ctx=await browser.newContext({viewport:{width,height:860},serviceWorkers:'block',reducedMotion:'reduce'});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{localStorage.setItem('tc_analytics_consent','no')});
  try{
   await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:40000});
   await page.locator('.tcStitchShell').waitFor({state:'visible',timeout:20000});
   const job=page.locator('[data-offer-id]').first();
   let loaded=false;
   for(let attempt=0;attempt<3;attempt++){
    try{await job.waitFor({state:'visible',timeout:16000});loaded=true;break;}
    catch{if(attempt<2)await page.reload({waitUntil:'domcontentloaded',timeout:25000});}
   }
   await check(width+'px offers remain visible after deploy',async()=>{
     assert(loaded,'Public jobs unavailable after manifest rebuild');
     assert((await job.getAttribute('data-offer-id'))?.length>2);
   });
   await check(width+'px defaults to all towns with no horizontal overflow',async()=>{
    assert.equal(await page.locator('.tcMobilePlace select').inputValue(),'Todas');
    const d=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
    assert(d.scroll<=d.width+2,JSON.stringify(d));
   });
   const block=page.locator('details.tcStitchPromotionDetails');
   if(await block.count()){
     await block.evaluate(el=>{el.open=true;});
     const card=block.locator('.tcFounderCard');await card.waitFor({state:'visible',timeout:7000});
     await check(width+'px founder image and CTA align',async()=>{
      const image=card.locator('img');await image.evaluate(img=>img.decode().catch(()=>undefined));
      assert((await image.evaluate(img=>img.naturalWidth))>0);
      const d=await card.evaluate(el=>{
       const a=el.getBoundingClientRect(),b=el.querySelector('.tcFounderMessage').getBoundingClientRect(),c=el.querySelector('.tcFounderCta').getBoundingClientRect();
       return{minWidth:b.width,ctaRight:c.right,cardRight:a.right,cardLeft:a.left,ctaLeft:c.left};
      });
      assert(d.minWidth>=100&&d.ctaRight<=d.cardRight+3&&d.ctaLeft>=d.cardLeft-3,JSON.stringify(d));
     });
   }
   const house=page.locator('.tcInlineHousePromo').first();
   if(await house.count()){
     await check(width+'px large self-promo image fits',async()=>{
       const photo=house.locator('.tcHouseFallbackThumb');await photo.evaluate(img=>img.decode().catch(()=>undefined));
       assert((await photo.evaluate(img=>img.naturalWidth))>0);
       const d=await house.evaluate(el=>{
        const p=el.querySelector('.tcInlineHouseIcon').getBoundingClientRect(),a=el.getBoundingClientRect();
        return {photoWidth:p.width,cardRight:a.right,photoRight:p.right};
       });
       assert(d.photoWidth>=72&&d.photoRight<=d.cardRight+3,JSON.stringify(d));
     });
   }
   if(width<768){
     await page.getByRole('navigation',{name:'Navegación móvil de cuatro espacios'}).getByRole('button',{name:'Directorio'}).click();
   }else{
     await page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Servicios y negocios'}).click();
   }
   const dir=page.locator('#local-directory');await dir.locator('.tcDirectoryTop').waitFor({state:'visible',timeout:15000});
   const tortas=dir.locator('.tcDirectoryCard').filter({hasText:'Tortas'}).first();
   await tortas.waitFor({state:'visible',timeout:18000});
   await check(width+'px previously approved Tortas remains visible',async()=>{
     assert((await tortas.textContent()).includes('Renaico'));
   });
   const rate=tortas.getByRole('button',{name:'★ Calificar este servicio'});
   await rate.click();
   const modal=page.getByRole('dialog',{name:'Calificar servicio'});
   await modal.waitFor({state:'visible',timeout:8000});
   await check(width+'px five-star modal asks for verified email',async()=>{
     const stars=modal.getByRole('radiogroup',{name:'Calificación de 1 a 5 estrellas'}).getByRole('radio');
     assert.equal(await stars.count(),5);
     await stars.nth(4).click();
     assert.equal(await stars.nth(4).getAttribute('aria-checked'),'true');
     assert(await modal.getByRole('button',{name:'Continuar con mi correo'}).isVisible());
     assert(!await modal.getByRole('button',{name:'Enviar calificación'}).isEnabled());
   });
   await page.keyboard.press('Escape');await modal.waitFor({state:'detached'});
   await check(width+'px rating closes without JS errors',async()=>assert.deepEqual(errors,[]));
  }finally{await ctx.close()}
 }
}finally{await browser.close();}
console.log('LIVE_RELEASE_QA '+passed+' passed, no writes performed');
