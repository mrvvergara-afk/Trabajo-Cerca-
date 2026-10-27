// Actual React app + existing isolated SDK adapter; never calls production APIs.
// Start: npx vite preview --config qa/vite.qa.config.mjs
// Run: CHROME_PATH=/usr/bin/chromium node qa/stitch-browser-check.mjs
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const out='qa-output/stitch';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--no-sandbox']});
const rows=[];
try {
  for(const width of [360,390,430,768,1440]) {
    const page=await browser.newPage({viewport:{width,height:844},reducedMotion:'reduce'});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    await page.addInitScript(()=>{window.houseFixture='territory';});
    await page.goto('http://127.0.0.1:4174/',{waitUntil:'networkidle'});
    await page.locator('.neoJobCard').first().waitFor();
    // Explicit overlay is test-only. No synthetic content may be shipped as a real feed.
    await page.evaluate(()=>{const flag=document.createElement('div');flag.textContent='PRUEBA AISLADA · DATOS SINTÉTICOS';flag.style.cssText='background:#fff3ce;color:#4f3f13;padding:6px;text-align:center;font:11px sans-serif';document.body.prepend(flag);});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'horizontal overflow');
    const firstCard=await page.locator('.neoJobCard').first().boundingBox();
    await page.locator('.neoJobFoot button').first().click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button',{name:'Cerrar detalle',exact:true}).click();
    await page.locator('.neoFilterSearch input').fill('no-match-stitch-test');
    await page.waitForFunction(()=>!document.querySelector('.neoJobCard'));
    await page.getByRole('button',{name:'Quitar filtros',exact:true}).click();
    await page.locator('.neoJobCard').first().waitFor();
    if(width<721) {
      await page.getByLabel('Localidad del radar',{exact:true}).selectOption('Lumaco');
      await page.waitForFunction(()=>document.querySelector('#tc-results-title').textContent.includes('Lumaco'));
      await page.getByLabel('Localidad del radar',{exact:true}).selectOption('Todas');
      await page.getByRole('button',{name:'Filtros',exact:true}).click();
      assert(await page.getByLabel('Comuna de resultados',{exact:true}).isVisible());
    }
    const links=[['Ofrecerme','ofrezco'],['Contratar','trabajadores']];
    for(const [label] of links) {
      if(width<721)await page.locator('.neoMobileNav').getByRole('button',{name:label,exact:true}).click();
      else await page.locator('.tcQuickActions').getByRole('button',{name:label==='Ofrecerme'?'Ofrecer mi trabajo':'Necesito contratar',exact:true}).click();
      await page.getByRole('dialog').waitFor();
      await page.keyboard.press('Escape');
    }
    await page.locator('.tcFooterLegal').getByRole('button',{name:'Privacidad',exact:true}).click();
    await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');
    const calls=await page.evaluate(()=>window.houseCalls||[]);
    assert(!calls.some(c=>/radar.*(collect|verify)|admin.*(import|restore)/.test(c.path)),'unexpected operational action');
    await page.screenshot({path:`${out}/${width}-full.png`,fullPage:true});
    await page.locator('.tcHouseAd').first().screenshot({path:`${out}/${width}-house.png`});
    assert.deepEqual(errors,[]);
    rows.push({width,firstCard,errors,adapter:'isolated fixture; not production SDK'});
    await page.close();
  }
  writeFileSync(`${out}/results.json`,JSON.stringify(rows,null,2));
} finally {await browser.close();}
