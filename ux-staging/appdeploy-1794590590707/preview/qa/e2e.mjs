import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const URL=process.env.UX_QA_URL || 'http://127.0.0.1:4173';
const ROOT=path.resolve('qa/captures');
fs.mkdirSync(ROOT,{recursive:true});
const widths=[320,360,390,412,768,1440];
let passed=0,failures=[];
function check(name,fn){return Promise.resolve().then(fn).then(()=>{passed++;console.log('PASS '+name)})}
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 for(const width of widths){
  const context=await browser.newContext({viewport:{width,height:860},serviceWorkers:'block',reducedMotion:'reduce'});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try{
   await page.goto(URL,{waitUntil:'domcontentloaded',timeout:30000});
   await page.locator('.tcStitchShell').waitFor({state:'visible',timeout:20000});
   await check(width+'px: frontend mounts',async()=>assert.equal(await page.locator('.tcStitchShell').count(),1));
   await check(width+'px: no horizontal overflow',async()=>{
     const sizes=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:window.innerWidth}));
     assert(sizes.scroll<=sizes.width+2,JSON.stringify(sizes));
   });
   if(width<=767){
    const nav=page.getByRole('navigation',{name:'Navegación móvil de cuatro espacios'});
    await check(width+'px: four mobile destinations',async()=>{
      assert(await nav.isVisible());
      assert.equal(await nav.locator('button').count(),4);
      assert.deepEqual(await nav.locator('button span').allTextContents(),['Empleos','Oficios','Servicios','Comercio']);
    });
    await check(width+'px: publish chooser keyboard',async()=>{
      const publish=page.getByRole('button',{name:'Publicar',exact:true});
      assert(await publish.isVisible());
      await publish.click();
      const dialog=page.getByRole('dialog',{name:'¿Qué quieres publicar?'});
      await dialog.waitFor({state:'visible'});
      assert.equal(await dialog.locator('button').count(),5);
      await page.keyboard.press('Escape');
      await dialog.waitFor({state:'hidden'});
    });
    await check(width+'px: business directory navigation',async()=>{
      await nav.getByRole('button',{name:'Comercio'}).click();
      const directory=page.locator('#local-directory');
      await directory.waitFor({state:'visible'});
      assert((await directory.textContent()).includes('Negocios'));
      await nav.getByRole('button',{name:'Empleos'}).click();
      await directory.waitFor({state:'detached'});
    });
    await check(width+'px: service directory navigation',async()=>{
      await nav.getByRole('button',{name:'Servicios'}).click();
      const directory=page.locator('#local-directory');
      await directory.waitFor({state:'visible'});
      assert((await directory.textContent()).includes('Oficios'));
    });
   }else{
    await check(width+'px: desktop four destinations',async()=>{
      const nav=page.locator('.neoTopNav');
      assert(await nav.isVisible());
      assert.equal(await nav.locator('button').count(),4);
    });
   }
   await check(width+'px: no uncaught app exceptions',async()=>assert.equal(errors.length,0,errors.join(' | ')));
   await page.screenshot({path:path.join(ROOT,'ux-'+width+'.png'),fullPage:true,animations:'disabled'});
  }catch(error){
   const message=error instanceof Error?error.message:String(error);
   failures.push({width,error:message});
   console.error('FAIL '+width+'px: '+message);
   await page.screenshot({path:path.join(ROOT,'error-'+width+'.png'),fullPage:true}).catch(()=>undefined);
  }finally{await context.close();}
 }
}finally{await browser.close();}
console.log('UX QA browser: '+passed+' checks passed, '+failures.length+' viewport failures');
if(failures.length)process.exitCode=1;
