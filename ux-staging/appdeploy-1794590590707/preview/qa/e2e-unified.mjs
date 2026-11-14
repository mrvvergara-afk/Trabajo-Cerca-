import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
const URL='http://127.0.0.1:4173';
const captures=path.resolve('qa/unified-captures');fs.mkdirSync(captures,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let pass=0;const failures=[];
const check=async(name,fn)=>{await fn();pass++;console.log('PASS '+name)};
try{
 for(const width of [320,360,390,412,768,1440]){
  const context=await browser.newContext({viewport:{width,height:820},serviceWorkers:'block',reducedMotion:'reduce'});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  if(width===390)await page.addInitScript(()=>{
   localStorage.setItem('tc_directory_owner_local_12345678-1234-1234-1234-123456789abc','qa-owner-token');
  });
  try{
   await page.goto(URL,{waitUntil:'domcontentloaded',timeout:20000});
   await page.locator('.tcStitchShell').waitFor({state:'visible',timeout:15000});
   await check(width+'px: app mounts',async()=>assert.equal(await page.locator('.tcStitchShell').count(),1));
   const mobile=width<=767;
   if(mobile){
    const nav=page.getByRole('navigation',{name:'Navegación móvil de cuatro espacios'});
    await check(width+'px: four distinct destinations',async()=>{
     assert(await nav.isVisible());
     assert.deepEqual(await nav.locator('button span').allTextContents(),['Empleos','Personas','Directorio','Publicar']);
     assert.equal(await page.locator('.tcMobilePublishAction').count(),0);
    });
    await nav.getByRole('button',{name:'Directorio'}).click();
   }else{
    const nav=page.getByRole('navigation',{name:'Navegación principal'});
    await check(width+'px: desktop navigation no duplicated services',async()=>assert.equal(await nav.locator('button').count(),3));
    await nav.getByRole('button',{name:'Servicios y negocios'}).click();
   }
   const dir=page.locator('#local-directory');
   await dir.locator('.tcDirectoryTop').waitFor({state:'visible',timeout:10000});
   await check(width+'px: unified directory and two synthetic approved listings',async()=>{
    assert((await dir.getByRole('heading',{name:'Directorio local'}).count())===1);
    assert.equal(await dir.locator('.tcDirectoryCard').count(),2);
    assert.equal(await dir.locator('.tcDirectoryTabs button').count(),3);
    assert(!await page.locator('.neoDiscover').isVisible());
   });
   await check(width+'px: three independent category filters',async()=>{
    await dir.getByRole('button',{name:'Negocios',exact:true}).click();
    await page.waitForTimeout(50);
    assert.equal(await dir.locator('.tcDirectoryCard').count(),1);
    await dir.getByRole('button',{name:'Servicios',exact:true}).click();
    await page.waitForTimeout(50);
    assert.equal(await dir.locator('.tcDirectoryCard').count(),1);
    await dir.getByRole('button',{name:'Todos',exact:true}).click();
    await page.waitForTimeout(50);
    assert.equal(await dir.locator('.tcDirectoryCard').count(),2);
   });
   await check(width+'px: search soldadura',async()=>{
    const search=dir.getByRole('searchbox',{name:'Buscar en el directorio'});
    await search.fill('soldadura');
    assert.equal(await dir.locator('.tcDirectoryCard').count(),1);
    await search.fill('');
   });
   const entry=dir.locator('.tcDirectoryCard').filter({hasText:'Soldaduras de ejemplo'});
   await entry.getByRole('button',{name:'Opinar sobre el servicio'}).click();
   await check(width+'px: simple inline rating',async()=>{
    const review=entry.locator('.tcDirectoryReviewForm');
    assert(await review.isVisible());
    assert.equal(await review.locator('.tcDirectoryReviewChoices button').count(),3);
    assert(!await review.getByRole('button',{name:'Enviar opinión'}).isEnabled());
    await review.getByRole('button',{name:/Bueno/}).click();
    assert.equal(await review.getByRole('button',{name:/Bueno/}).getAttribute('aria-pressed'),'true');
    assert(!await review.getByRole('button',{name:'Enviar opinión'}).isEnabled());
   });
   await entry.locator('.tcDirectoryReviewForm').getByRole('button',{name:'Cancelar'}).click();
   if(width===390){
    await check('390px: owner sees pending pastry with private photo',async()=>{
     const receipt=dir.locator('.tcDirectoryOwnedPreview');
     await receipt.waitFor({state:'visible',timeout:6000});
     assert((await receipt.textContent()).includes('Pendiente de aprobación'));
     assert((await receipt.textContent()).includes('Pastelería de prueba'));
     assert.equal(await receipt.locator('img').count(),1);
    });
   }
   if(mobile){
    await page.getByRole('navigation',{name:'Navegación móvil de cuatro espacios'})
      .getByRole('button',{name:'Publicar gratis en Trabajo Cerca'}).click();
    const chooser=page.getByRole('dialog',{name:'¿Qué quieres publicar?'});
    await chooser.waitFor({state:'visible'});
    await check(width+'px: publish services directly',async()=>{
     assert(await chooser.getByRole('button',{name:/Ofrezco servicios o productos/}).isVisible());
     await chooser.getByRole('button',{name:/Ofrezco servicios o productos/}).click();
     const form=page.locator('#local-directory .tcDirectoryForm').filter({has:page.getByRole('heading',{name:'Publicar en el directorio'})});
     await form.waitFor({state:'visible',timeout:10000});
     assert(await form.getByRole('radio',{name:/Servicio.*soldadura/}).isChecked());
     await form.getByRole('radio',{name:/Negocio.*pastelería/}).check();
     assert(await form.getByRole('radio',{name:/Negocio.*pastelería/}).isChecked());
     assert.equal(await form.locator('input[type=file]').count(),1);
     const rows=await form.locator('.tcDirectoryKindChoice label').evaluateAll(labels=>labels.map(label=>{
       const rect=label.getBoundingClientRect();
       const input=label.querySelector('input').getBoundingClientRect();
       const text=label.querySelector('span').getBoundingClientRect();
       return {box:{left:rect.left,right:rect.right},input:{left:input.left,right:input.right,width:input.width},text:{left:text.left,right:text.right,width:text.width}};
     }));
     assert.equal(rows.length,2);
     for(const row of rows){
       assert(row.input.width<=22 && row.input.left>=row.box.left-2 && row.input.right<=row.box.right+2,'Oversized radio '+JSON.stringify(row));
       assert(row.text.left>=row.box.left-2 && row.text.right<=row.box.right+2,'Label escapes option '+JSON.stringify(row));
     }
    });
   }
   await check(width+'px: no overflow or uncaught errors',async()=>{
    const widths=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,window:innerWidth}));
    assert(widths.scroll<=widths.window+2,JSON.stringify(widths));
    assert.deepEqual(errors,[]);
   });
   await page.screenshot({path:path.join(captures,'unified-'+width+'.png'),fullPage:true,animations:'disabled'});
  }catch(e){
   const error=e instanceof Error?e.message:String(e);
   failures.push({width,error});
   console.error('FAIL '+width+'px '+error);
   await page.screenshot({path:path.join(captures,'error-'+width+'.png'),fullPage:true}).catch(()=>undefined);
  }finally{await context.close();}
 }
}finally{await browser.close();}
console.log('UNIFIED_UI '+pass+' passed; '+failures.length+' viewport failures');
if(failures.length)process.exitCode=1;
