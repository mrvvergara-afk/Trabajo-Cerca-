import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const dest=path.resolve('qa/captures-founders');fs.mkdirSync(dest,{recursive:true});
let passed=0;const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)};
try{
 for(const width of [320,360,390,412,768,1440]){
  const context=await browser.newContext({viewport:{width,height:850},serviceWorkers:'block',reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];page.on('pageerror',err=>errors.push(err.message));
  await page.addInitScript(()=>{
   localStorage.setItem('tc_analytics_consent','no');
  });
  if(width===390)await page.addInitScript(()=>localStorage.setItem('tc_qa_verified_review','yes'));
  try{
   await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded',timeout:25000});
   await page.locator('.tcStitchShell').waitFor({state:'visible',timeout:10000});
   const section=page.locator('details.tcStitchPromotionDetails');
   await section.waitFor({state:'attached',timeout:10000});
   await section.evaluate(el=>{el.open=true;});
   const founder=section.locator('.tcFounderCard');await founder.waitFor({state:'visible'});
   await check(width+'px founder benefit is readable, not squeezed',async()=>{
    const metrics=await founder.evaluate(el=>{
     const card=el.getBoundingClientRect(),copy=el.querySelector('.tcFounderMessage').getBoundingClientRect(),
     cta=el.querySelector('.tcFounderCta').getBoundingClientRect();
     return {card:{left:card.left,right:card.right,width:card.width},
      copy:{width:copy.width,left:copy.left,right:copy.right},
      cta:{left:cta.left,right:cta.right,width:cta.width}};
    });
    assert(metrics.copy.width>100,JSON.stringify(metrics));
    assert(metrics.cta.left>=metrics.card.left-2&&metrics.cta.right<=metrics.card.right+2,JSON.stringify(metrics));
    assert((await founder.textContent()).includes('20 negocios elegibles'));
    assert((await founder.textContent()).includes('Sin cobros automáticos'));
   });
   await check(width+'px founder campaign photograph loads',async()=>{
    const image=founder.locator('.tcFounderImage img');
    await image.evaluate(el=>el.decode().catch(()=>undefined));
    assert((await image.evaluate(el=>el.naturalWidth))>0);
   });
   const ad=page.locator('.tcInlineHousePromo').first();await ad.waitFor({state:'visible',timeout:10000});
   await check(width+'px in-feed institutional ad has a large photo and legible CTA',async()=>{
    const illustration=ad.locator('.tcHouseFallbackThumb');
    await illustration.evaluate(img=>img.decode().catch(()=>undefined));
    assert((await illustration.evaluate(img=>img.naturalWidth))>0);
    const m=await ad.evaluate(el=>{
      const a=el.getBoundingClientRect(),p=el.querySelector('.tcInlineHouseIcon').getBoundingClientRect(),
      b=el.querySelector('button').getBoundingClientRect();
      return{ad:{left:a.left,right:a.right},photo:{width:p.width,right:p.right},
      cta:{left:b.left,right:b.right}};
    });
    assert(m.photo.width>=72,JSON.stringify(m));
    assert(m.cta.left>=m.ad.left-2&&m.cta.right<=m.ad.right+2,JSON.stringify(m));
   });
   const adButton=ad.getByRole('button',{name:/Mostrar mis trabajos gratis/});
   await adButton.click();
   const dir=page.locator('#local-directory');await dir.locator('.tcDirectoryTop').waitFor({state:'visible'});
   const publish=dir.locator('form.tcDirectoryForm').filter({hasText:'Publicar en el directorio'});
   await publish.waitFor({state:'visible',timeout:8500});
   await dir.getByRole('button',{name:'Cerrar formulario'}).click();
   const card=dir.locator('.tcDirectoryCard').filter({hasText:'Soldaduras de ejemplo'}).first();
   await card.getByRole('button',{name:'★ Calificar este servicio'}).click();
   const dialog=page.getByRole('dialog',{name:'Calificar servicio'});
   await dialog.waitFor({state:'visible',timeout:8000});
   await check(width+'px service rating opens own modal and five stars',async()=>{
    const stars=dialog.getByRole('radiogroup',{name:'Calificación de 1 a 5 estrellas'}).getByRole('radio');
    assert.equal(await stars.count(),5);
    await stars.nth(3).click();
    assert.equal(await stars.nth(3).getAttribute('aria-checked'),'true');
    assert((await dialog.textContent()).includes('4 de 5 estrellas'));
   });
   await check(width+'px authenticated email is required for sending a review',async()=>{
    const send=dialog.getByRole('button',{name:'Enviar calificación'});
    assert(!await send.isEnabled());
    if(width===390){
     assert((await dialog.textContent()).includes('qa-reviewer@example.invalid'));
     await dialog.getByRole('checkbox',{name:/Confirmo que contraté/}).check();
     assert(await send.isEnabled());
    }else{
     const button=dialog.getByRole('button',{name:'Continuar con mi correo'});
     assert(await button.isVisible());
     await button.click();
     await dialog.getByRole('alert').waitFor({state:'visible',timeout:4000});
     assert(!await send.isEnabled());
    }
   });
   if(width===390)await page.screenshot({path:path.join(dest,'rating-modal-390.png'),animations:'disabled'});
   await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
   await check(width+'px dismiss rating restores app and no page overflow',async()=>{
    const metrics=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:document.body.style.overflow}));
    assert(metrics.scroll<=metrics.width+2,JSON.stringify(metrics));
    assert.deepEqual(errors,[]);
   });
   if(width===390){
    await page.evaluate(()=>localStorage.setItem('tc_directory_owner_local_aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','qa-owner-token'));
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.tcStitchShell').waitFor({state:'visible'});
    const nav=page.getByRole('navigation',{name:'Navegación móvil de cuatro espacios'});
    await nav.getByRole('button',{name:'Directorio'}).click();
    const owned=page.locator('.tcDirectoryCard').filter({hasText:'Soldaduras de ejemplo'}).first();
    await owned.waitFor({state:'visible'});
    await check('390px owner is informed why self-rating is unavailable',async()=>{
      assert.equal(await owned.getByRole('button',{name:/Calificar este servicio/}).count(),0);
      assert((await owned.textContent()).includes('Esta ficha es tuya'));
    });
    await section.evaluate(el=>{el.open=true;}).catch(()=>undefined);
    await page.screenshot({path:path.join(dest,'founder-390.png'),fullPage:true,animations:'disabled'});
   }
  }finally{await context.close();}
 }
}finally{await browser.close();}
console.log('FOUNDERS_RATINGS_BROWSER '+passed+' checks passed; no real posts');
