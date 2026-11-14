import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const url = 'https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/';
const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
let checks = 0;
const pass=(name)=>{checks++;console.log('PASS '+name)};
try {
  for (const width of [320,390,412,768]) {
    const ctx=await browser.newContext({viewport:{width,height:850},serviceWorkers:'block',reducedMotion:'reduce'});
    const page=await ctx.newPage();
    const jsErrors=[];
    page.on('pageerror',e=>jsErrors.push(e.message));
    try {
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
      await page.locator('.tcStitchShell').waitFor({state:'visible',timeout:25000});
      assert.equal(await page.locator('.tcStitchShell').count(),1);pass(width+'px real site mounts');
      const display=await page.evaluate(()=>({w:document.documentElement.scrollWidth,v:innerWidth}));
      assert(display.w<=display.v+2,JSON.stringify(display));pass(width+'px no overflow');
      const cards=page.locator('[data-offer-id]');
      await cards.first().waitFor({state:'visible',timeout:25000});
      const ids=await cards.evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-offer-id')));
      assert(ids.length>0&&ids.every(x=>x?.length>2),'No public job IDs');
      pass(width+'px real offers visible ('+ids.length+' cards)');
      if(width<=412){
        const brand=await page.locator('.neoBrand').first().boundingBox();
        const commune=await page.locator('.tcMobilePlace').boundingBox();
        assert(brand&&commune&&brand.x+brand.width<=commune.x+2,'Brand and commune overlap');
        pass(width+'px brand does not overlap commune');
        const ad=page.locator(".tcLocalAdvertising.tcCommercialCard[data-placement='search']");
        if(await ad.isVisible()){
          const bounds=await ad.boundingBox();
          assert(bounds&&bounds.height<=205,'Public commercial ad still too tall: '+JSON.stringify(bounds));
          pass(width+'px commercial ad compact ('+Math.round(bounds.height)+'px)');
        }
        const nav=page.getByRole('navigation',{name:'Navegación móvil de cuatro espacios'});
        await nav.getByRole('button',{name:'Servicios'}).click();
        const dir=page.locator('#local-directory');
        await dir.locator('.tcDirectoryTop').waitFor({state:'visible',timeout:10000});
        assert(!await page.locator('.neoDiscover').isVisible(),'Employment catalog leaks into services view');
        pass(width+'px Services isolated from job feed');
        const formButton=dir.getByRole('button',{name:'Ofrecer un servicio gratis'});
        await formButton.click();
        const form=dir.locator('form.tcDirectoryForm');
        assert(await form.isVisible(),'No directory submission form');
        assert.equal(await form.locator('input[type=file]').count(),1);
        pass(width+'px service photo form present (read-only check)');
        await nav.getByRole('button',{name:'Comercio'}).click();
        await dir.locator('.tcDirectoryTabs button.active').waitFor({state:'visible',timeout:10000});
        assert(!await page.locator('.neoDiscover').isVisible(),'Employment catalog leaks into commerce view');
        pass(width+'px Commerce isolated from job feed');
      }
      assert.deepEqual(jsErrors,[]);pass(width+'px no uncaught javascript exceptions');
    } finally {await ctx.close();}
  }
} finally {await browser.close();}
console.log('POST_DEPLOY_LIVE '+checks+' checks passed');
