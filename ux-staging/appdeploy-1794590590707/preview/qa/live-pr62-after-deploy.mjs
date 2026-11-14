import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const base='https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let passed=0;
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
try {
 for(const width of [320,360,390,412,768,1440]){
  const context=await browser.newContext({viewport:{width,height:850},serviceWorkers:'block',reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
  try{
   await page.locator('.tcStitchShell').waitFor({state:'visible',timeout:25000});
   await check(width+'px public page mounts',async()=>assert.equal(await page.locator('.tcStitchShell').count(),1));
   await check(width+'px starts at Todas',async()=>{
     const place=page.locator('.tcMobilePlace select');
     assert.equal(await place.inputValue(),'Todas');
     assert.equal((await place.locator('option:checked').textContent()).trim(),'Todas');
   });
   await check(width+'px no horizontal overflow',async()=>{
     const a=await page.evaluate(()=>({body:document.documentElement.scrollWidth,window:innerWidth}));
     assert(a.body<=a.window+2,JSON.stringify(a));
   });
   if(width<=767){
     const nav=page.getByRole('navigation',{name:'Navegación móvil de cuatro espacios'});
     await check(width+'px 4 mobile buttons, all labeled',async()=>{
       assert.deepEqual(await nav.locator('button span').allTextContents(),['Empleos','Personas','Directorio','Publicar']);
       assert.equal(await page.locator('.tcMobilePublishAction').count(),0);
     });
     await nav.getByRole('button',{name:'Directorio'}).click();
   }else{
     const nav=page.getByRole('navigation',{name:'Navegación principal'});
     await check(width+'px desktop directory unified',async()=>{
       assert.equal(await nav.locator('button').count(),3);
     });
     await nav.getByRole('button',{name:'Servicios y negocios'}).click();
   }
   const dir=page.locator('#local-directory');
   await dir.locator('.tcDirectoryTop').waitFor({state:'visible',timeout:20000});
   await check(width+'px admin panel absent from public directory',async()=>{
     assert.equal(await dir.locator('.tcDirectoryAdmin').count(),0);
     assert.equal(await dir.locator('.tcDirectoryTabs button').count(),3);
     assert(!await page.locator('.neoDiscover').isVisible());
   });
   await check(width+'px Tortas published for all territory',async()=>{
     const card=dir.locator('.tcDirectoryCard').filter({hasText:'Tortas'}).first();
     await card.waitFor({state:'visible',timeout:20000});
     assert((await card.textContent()).includes('Renaico'));
   });
   await check(width+'px services filter finds Tortas',async()=>{
     await dir.getByRole('button',{name:'Servicios',exact:true}).click();
     const card=dir.locator('.tcDirectoryCard').filter({hasText:'Tortas'}).first();
     await card.waitFor({state:'visible',timeout:10000});
     assert((await card.textContent()).includes('Renaico'));
   });
   await check(width+'px no uncaught JS errors',async()=>assert.deepEqual(errors,[]));
   if(width<=767){
     await page.getByRole('navigation',{name:'Navegación móvil de cuatro espacios'})
       .getByRole('button',{name:'Publicar gratis en Trabajo Cerca'}).click();
     const chooser=page.getByRole('dialog',{name:'¿Qué quieres publicar?'});
     await chooser.waitFor({state:'visible'});
     await check(width+'px publish chooser includes directory',async()=>{
       assert(await chooser.getByRole('button',{name:/Ofrezco servicios o productos/}).isVisible());
     });
     await chooser.getByRole('button',{name:/Ofrezco servicios o productos/}).click();
     const form=page.locator('#local-directory form.tcDirectoryForm')
       .filter({has:page.getByRole('heading',{name:'Publicar en el directorio'})});
     await form.waitFor({state:'visible',timeout:10000});
     await check(width+'px publish service form requires commune',async()=>{
       const sel=form.locator('select[required]');
       assert.equal(await sel.inputValue(),'');
       assert.equal(await form.locator('input[type=file]').count(),1);
     });
   }
  } finally {await context.close();}
 }
}finally{await browser.close();}
console.log('POST_PR62_LIVE '+passed+' checks passed; zero writes to production.');
