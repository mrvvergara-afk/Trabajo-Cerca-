// Real React components + isolated SDK only. No production or collector requests.
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {basename,resolve} from 'node:path';
import assert from 'node:assert/strict';
const out='qa-output/stitch-fidelity';mkdirSync(out,{recursive:true});
const origin=process.env.STITCH_PREVIEW_URL||'http://127.0.0.1:4174';
const rows=[];let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--no-sandbox']});
  for(const width of [1440,390,360,430,768]){
    const page=await browser.newPage({viewport:{width,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
    page.setDefaultTimeout(10000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin===origin)return route.continue();
      // Default campaign photos are repository assets; fulfill locally, never call GitHub/CDNs.
      const file=basename(url.pathname);
      if(url.hostname==='raw.githubusercontent.com'&&/^house-[a-z-]+-photo-v2-(640|1200)\.webp$/.test(file)){
        const path=resolve('public/resources',file);
        if(existsSync(path))return route.fulfill({body:readFileSync(path),contentType:'image/webp'});
      }
      return route.abort();
    });
    const row={width,height:844,data:'synthetic isolated fixtures',errors,checks:[],screenshots:[]};rows.push(row);
    try{
      await page.goto(origin+'/qa/stitch-preview.html',{waitUntil:'networkidle'});
      await page.waitForFunction(()=>document.querySelector('.tcCatalogCount')?.textContent?.includes('26 resultados'));
      await page.evaluate(()=>document.fonts.ready);
      const count=width<768?4:6;
      assert.equal(await page.locator('.neoJobCard').count(),count);row.checks.push('responsive pagination');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'horizontal overflow');row.checks.push('no horizontal overflow');
      const geometry=await page.locator('.neoJobCard').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));row.cards=geometry;
      assert.equal(new Set(geometry.map(r=>Math.round(r.x))).size,width<768?1:width<1101?2:3);row.checks.push('reference column count');
      assert.deepEqual(errors,[]);
      // The comparison page and results label fixtures; hide only the QA watermark for captures.
      await page.locator('[data-qa-notice]').evaluate(n=>n.style.visibility='hidden');
      await page.screenshot({path:`${out}/${width}-viewport.png`});
      const fullHeight=await page.evaluate(()=>Math.ceil(document.documentElement.scrollHeight));
      await page.setViewportSize({width,height:Math.max(844,fullHeight)});
      await page.screenshot({path:`${out}/${width}-full.png`,fullPage:true});
      await page.setViewportSize({width,height:844});row.screenshots.push(`${width}-full.png`);
      await page.locator('.tcCampaignSelector button').first().waitFor();
      const selectors=page.locator('.tcCampaignSelector button');
      for(let i=0;i<await selectors.count();i++){
        await selectors.nth(i).click();const banner=page.locator('.tcStitchAdvertising .tcHouseAd:visible');
        await banner.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode().catch(()=>{}))));
        assert.equal(await banner.locator('img').evaluateAll(images=>images.every(image=>image.naturalWidth>0)),true,'campaign image missing');
        await banner.screenshot({path:`${out}/${width}-campaign-${i}.png`});
      }
      row.checks.push('allocated campaign selector and local images');
      await page.locator('.neoJobFoot button').first().click();await page.getByRole('dialog').waitFor();
      const detailStyle=await page.locator('.detailSheet').evaluate(el=>({bg:getComputedStyle(el).backgroundColor,title:getComputedStyle(el.querySelector('h2')).fontSize}));
      assert.equal(detailStyle.bg,'rgb(255, 255, 255)','public detail must use updated white surface');
      assert(parseFloat(detailStyle.title)>=22,'public detail title too small');
      if(width===1440||width===390)await page.getByRole('dialog').screenshot({path:`${out}/${width}-public-detail.png`});
      row.checks.push('public details green design and readable title');
      await page.getByRole('button',{name:'Cerrar detalle',exact:true}).click();row.checks.push('detail and return');
      const search=width<768?page.locator('.neoFilterSearch input'):page.locator('.tcRoleField input');
      await search.fill('no-match-stitch-test');await page.waitForFunction(()=>!document.querySelector('.neoJobCard'));
      await page.getByRole('button',{name:'Quitar filtros',exact:true}).click();await page.locator('.neoJobCard').first().waitFor();row.checks.push('search empty state and reset');
      if(width<768){await page.getByLabel('Localidad del radar',{exact:true}).selectOption('Lumaco');await page.waitForFunction(()=>document.querySelector('#tc-results-title')?.getAttribute('aria-label')?.includes('Lumaco'));await page.getByLabel('Localidad del radar',{exact:true}).selectOption('Todas');}
      await page.getByRole('button',{name:'Filtros',exact:true}).click();assert(await page.getByLabel('Comuna de resultados',{exact:true}).isVisible());
      await page.getByLabel('Área laboral',{exact:true}).selectOption('Agricultura');await page.waitForFunction(()=>document.querySelectorAll('.neoJobCard').length>0);row.checks.push('territory and category filters');
      await page.getByRole('button',{name:'Quitar filtros',exact:true}).click();
      await page.locator('.tcCommunityOffer').click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');
      if(width<768)await page.locator('.neoMobileNav').getByRole('button',{name:'Publicar',exact:true}).click();
      else await page.locator('.tcTopPublish').click();
      await page.getByRole('dialog').waitFor();
      const publicForm=await page.locator('.modal .panel').last().evaluate(el=>({heading:parseFloat(getComputedStyle(el.querySelector('h2')).fontSize),bg:getComputedStyle(el).backgroundColor,inputs:[...el.querySelectorAll('input:not([type=checkbox]):not([type=hidden])')].map(e=>Math.round(e.getBoundingClientRect().height))}));
      assert.equal(publicForm.bg,'rgb(255, 255, 255)','public form must use updated surface');
      assert(publicForm.heading>=22,'public form heading too small');
      assert(publicForm.inputs.some(height=>height>=44),'public form fields too small');
      if(width===1440||width===390)await page.getByRole('dialog').screenshot({path:`${out}/${width}-public-form.png`});
      await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});row.checks.push('public form visual styles, fields, open and close; no submit');
      await page.locator('.tcStitchFooterDetails').evaluate(n=>n.open=true);
      await page.locator('.tcFooterLegal').getByRole('button',{name:'Privacidad',exact:true}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');row.checks.push('privacy dialog');
      const calls=await page.evaluate(()=>window.houseCalls||[]);
      assert(!calls.some(c=>/radar.*(collect|verify)|admin.*(import|restore)/.test(c.path)),'unexpected operational action');assert.deepEqual(errors,[]);row.checks.push('no operational requests or uncaught errors');
      if(width===1440||width===390){
        await page.evaluate(()=>{sessionStorage.clear();sessionStorage.setItem('tc-house-turn','-1');});
        await page.reload({waitUntil:'networkidle'});
        const services=page.locator('.tcStitchAdvertising .tcHouseAd[data-creative-family=services]:visible');
        await services.waitFor();
        await services.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode().catch(()=>{}))));
        await services.screenshot({path:`${out}/${width}-services.png`});
        assert.deepEqual(errors,[]);row.checks.push('all three allocated creative families captured across isolated session turns');
      }
      row.passed=true;
    }catch(error){row.passed=false;row.failure=String(error);await page.screenshot({path:`${out}/${width}-failure.png`,fullPage:true}).catch(()=>{});}
    finally{writeFileSync(`${out}/results.json`,JSON.stringify({status:rows.every(r=>r.passed)?'passed':'failed',sdk:'isolated; not production',rows},null,2));await page.close();}
  }
  assert(rows.every(row=>row.passed),'Browser checks failed; inspect results.json and failure screenshots');
}catch(error){
  if(!browser)writeFileSync(`${out}/results.json`,JSON.stringify({status:'blocked',reason:String(error),rows},null,2));
  throw error;
}finally{await browser?.close();}
