import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const dest=path.resolve('qa/captures-marketplace');
fs.mkdirSync(dest,{recursive:true});
let total=0;const check=async(label,fn)=>{await fn();total++;console.log('PASS '+label)};
try{
 for(const width of [320,390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:860},serviceWorkers:'block',reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  if(width===390)await page.addInitScript(()=>{
   localStorage.setItem('tc_qa_verified_review','yes');
   localStorage.setItem('tc_directory_owner_local_12345678-1234-1234-1234-123456789abc','qa-owner-token');
  });
  try{
   await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded',timeout:20000});
   await page.locator('.tcStitchShell').waitFor({state:'visible',timeout:10000});
   const cookie=page.getByRole('button',{name:'No aceptar'});
   if(await cookie.isVisible().catch(()=>false))await cookie.click();
   const ad=page.locator(".tcInlineHousePromo[data-house-kind='showcase']").first();
   await ad.waitFor({state:'visible',timeout:10000});
   await check(width+'px marketing message is distinct and actionable',async()=>{
    const words=(await ad.textContent())||'';
    assert(words.includes('¡Que tu comuna vea lo que haces!'),words);
    assert(words.includes('Contacto directo'),words);
    assert(await ad.getByRole('button',{name:/Mostrar mis trabajos gratis/}).isVisible());
    const bounds=await ad.boundingBox();
    assert(bounds&&bounds.width<=width+1,JSON.stringify(bounds));
   });
   await ad.getByRole('button',{name:/Mostrar mis trabajos gratis/}).click();
   const dir=page.locator('#local-directory');
   await dir.locator('.tcDirectoryTop').waitFor({state:'visible',timeout:9000});
   await check(width+'px marketing CTA actually opens photo-enabled services form',async()=>{
    const form=dir.locator('form.tcDirectoryForm').filter({hasText:'Publicar en el directorio'});
    await form.waitFor({state:'visible',timeout:6500});
    assert.equal(await form.locator('input[type=file]').count(),1);
   });
   await dir.getByRole('button',{name:'Cerrar formulario'}).click();
   const card=dir.locator('.tcDirectoryCard').filter({hasText:'Soldaduras de ejemplo'});
   await check(width+'px public photo thumbnail opens zoom overlay',async()=>{
    await card.getByRole('button',{name:'Ampliar fotografía 1 de Soldaduras de ejemplo'}).click();
    const modal=page.getByRole('dialog',{name:'Fotografías de Soldaduras de ejemplo'});
    await modal.waitFor({state:'visible',timeout:7000});
    assert((await modal.textContent()).includes('1 / 2'));
    assert(await modal.locator('img').isVisible());
    if(width===390)await page.screenshot({path:path.join(dest,'gallery-390.png'),animations:'disabled'});
    await modal.getByRole('button',{name:'Fotografía siguiente'}).click();
    assert((await modal.textContent()).includes('2 / 2'));
    await page.keyboard.press('Escape');
    await modal.waitFor({state:'detached',timeout:5000});
   });
   await card.getByRole('button',{name:/Calificar servicio/}).click();
   const review=card.locator('.tcDirectoryReviewForm');
   await check(width+'px five-star interaction visible',async()=>{
    assert(await review.isVisible());
    const stars=review.getByRole('radiogroup',{name:'Elige de 1 a 5 estrellas'}).getByRole('radio');
    assert.equal(await stars.count(),5);
    await stars.nth(4).click();
    assert.equal(await stars.nth(4).getAttribute('aria-checked'),'true');
    const send=review.getByRole('button',{name:'Enviar calificación'});
    assert(!await send.isEnabled());
    const login=review.getByRole('button',{name:'Confirmar mi correo para opinar'});
    if(width===390){
      assert.equal(await login.count(),0);
      await review.getByRole('checkbox',{name:/Confirmo que contraté/}).check();
      assert(await send.isEnabled());
      assert((await review.textContent()).includes('qa-reviewer@example.invalid'));
    }else{
      assert(await login.isVisible());
      assert(!await send.isEnabled());
    }
   });
   if(width===390)await page.screenshot({path:path.join(dest,'ratings-390.png'),animations:'disabled'});
   await review.getByRole('button',{name:'Cancelar'}).click();
   if(width===390){
     await check('390px private owner gallery also has zoom',async()=>{
      const receipt=dir.locator('.tcDirectoryOwnedPreview').first();
      await receipt.waitFor({state:'visible',timeout:6000});
      await receipt.getByRole('button',{name:/Ampliar fotografía 1 de Pastelería de prueba/}).click();
      const zoom=page.getByRole('dialog',{name:'Fotografías de Pastelería de prueba'});
      await zoom.waitFor({state:'visible',timeout:5000});
      await zoom.getByRole('button',{name:'Cerrar fotografía'}).click();
      await zoom.waitFor({state:'detached',timeout:5000});
     });
   }
   await check(width+'px no JS errors or page overflow',async()=>{
    const measurements=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
    assert(measurements.scroll<=measurements.viewport+2,JSON.stringify(measurements));
    assert.deepEqual(errors,[]);
   });
   if(width===390)await page.screenshot({path:path.join(dest,'promotion-390.png'),fullPage:true,animations:'disabled'});
  } finally{await context.close();}
 }
}finally{await browser.close();}
console.log('MARKETPLACE_UI '+total+' browser checks passed');
