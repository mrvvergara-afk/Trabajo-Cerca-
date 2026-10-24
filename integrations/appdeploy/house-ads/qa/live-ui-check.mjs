// Read-only verification of the deployed app and its native SDK. No aliases, no synthetic listings.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';

const base = 'https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/';
const widths = [360,390,430,768,1440];
const snapshot = JSON.parse(readFileSync('qa-output/visual-review/public-feed.json','utf8'));
mkdirSync('qa-output/deployed-ui', {recursive:true});
const browser = await chromium.launch({headless:true, ...(existsSync('/usr/bin/google-chrome') ? {executablePath:'/usr/bin/google-chrome'} : {})});
const rows = [], errors = [], serverErrors = [], suppressed = [];
let catalogueRequests = 0;
try {
  const context = await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await context.route('**/*', route => {
    const request = route.request(), body = request.postData() || '';
    if (/\/api\/listings/.test(body+' '+request.url())) catalogueRequests++;
    if (!['GET','HEAD'].includes(request.method()) && /house-events|commercial-events|growth\/events|sponsor-impression|analytics/i.test(body+' '+request.url())) {
      suppressed.push('measurement blocked');
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 500) serverErrors.push({url:response.url().split('?')[0],status:response.status()}); });
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('.neoJobCard').first().waitFor({timeout:90000});
  await page.waitForFunction(() => document.querySelector('#neo-jobs')?.getAttribute('aria-busy') === 'false', {}, {timeout:90000});
  const worker = await page.request.get(base+'sw.js');
  const workerSource = await worker.text();
  const applied = worker.ok() && workerSource.includes('trabajo-cerca-shell-ui-20261024');
  for (const width of widths) {
    await page.setViewportSize({width,height:width<800?844:1000});
    await page.evaluate(() => scrollTo(0,0));
    const metrics = await page.evaluate(() => {
      const box = selector => { const e=document.querySelector(selector),r=e.getBoundingClientRect(); return {top:r.top,height:r.height}; };
      return {header:box('.neoTopbar'),hero:box('.neoHero'),search:box('.neoSearchDock'),strip:box('.tcActivityStrip'),firstCard:box('.neoJobCard'),titleFont:parseFloat(getComputedStyle(document.querySelector('.neoHero h1')).fontSize),quickColumns:getComputedStyle(document.querySelector('.tcQuickActions')).gridTemplateColumns.split(' ').length,overflow:document.documentElement.scrollWidth>innerWidth+1};
    });
    const card = page.locator('.neoJobCard').first();
    const id = await card.getAttribute('data-offer-id');
    assert(snapshot.items.some(item => item.id === id),'deployed card must come from the native SDK inventory');
    await page.screenshot({path:`qa-output/deployed-ui/${width}-first.png`});
    await card.screenshot({path:`qa-output/deployed-ui/${width}-card.png`});
    if (applied) {
      assert.equal(metrics.overflow,false);
      assert.equal(await card.locator('.tcOfferDates').count(),0);
      if (width<800) {
        assert(metrics.header.height>=48 && metrics.header.height<=52);
        assert(metrics.titleFont>=21 && metrics.titleFont<=24);
        assert.equal(metrics.quickColumns,4);
        assert(metrics.firstCard.top<650);
      }
    }
    for (const [selector,name] of [['#tc-other-cities','cities'],['#actualidad-laboral','news']]) {
      const panel=page.locator(selector);
      if(!await panel.evaluate(e=>e.open)) await panel.locator(':scope > summary').click();
      await panel.scrollIntoViewIfNeeded();
      await panel.screenshot({path:`qa-output/deployed-ui/${width}-${name}.png`});
    }
    const radar=page.locator('#neo-radar');
    await radar.locator('.tcRadarDetails').evaluate(e=>e.open=true);
    await radar.scrollIntoViewIfNeeded();
    await radar.screenshot({path:`qa-output/deployed-ui/${width}-radar.png`});
    assert.equal(await radar.locator('.tcRadarTowns button').count(),13);
    const ad=page.locator('.tcHouseAd').first();
    if(await ad.count()) {
      await ad.scrollIntoViewIfNeeded();
      const image=ad.locator('.tcAdImage');
      if(await image.count()) { await image.evaluate(e=>e.decode()); assert(await image.evaluate(e=>e.naturalWidth>0)); }
      await ad.screenshot({path:`qa-output/deployed-ui/${width}-house.png`});
    }
    await page.locator('.neoFooter').scrollIntoViewIfNeeded();
    await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));
    await page.locator('.neoFooter').screenshot({path:`qa-output/deployed-ui/${width}-footer.png`});
    rows.push({width,id,metrics});
  }
  if(applied){const next=page.getByRole('button',{name:'Siguiente página',exact:true});if(await next.isEnabled()){const id=await page.locator('.neoJobCard').first().getAttribute('data-offer-id');await next.click();assert.notEqual(await page.locator('.neoJobCard').first().getAttribute('data-offer-id'),id);await page.getByRole('button',{name:'Página anterior',exact:true}).click();assert.equal(await page.locator('.neoJobCard').first().getAttribute('data-offer-id'),id);}}
  await page.locator('.neoJobCard').first().locator('.neoJobFoot button').click();
  const detail=page.getByRole('dialog');await detail.waitFor();
  assert((await detail.innerText()).includes('PUBLICACIÓN ORIGINAL'));
  assert((await detail.innerText()).includes('INCORPORADA EN TRABAJO CERCA'));
  assert(await detail.getByRole('link',{name:/Ver oferta original/}).count());
  await page.getByRole('button',{name:'Cerrar detalle',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  const filter=page.locator('.neoFilterSearch input');
  await filter.fill('zz-no-match-ui-live');
  await page.waitForFunction(()=>document.querySelectorAll('.neoJobCard').length===0);
  await page.locator('.tcClearFilters').click();
  await page.locator('.neoJobCard').first().waitFor();
  assert.equal(await filter.inputValue(),'');
  let nativeRadar = {tested:false};
  if(applied) {
    const radar=page.locator('#neo-radar');
    await page.emulateMedia({reducedMotion:'no-preference'});
    await radar.scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector('#neo-radar')?.getAttribute('data-rotating')==='true');
    const first=await radar.getAttribute('data-focus-town'), requests=catalogueRequests;
    await page.waitForFunction(town=>document.querySelector('#neo-radar')?.getAttribute('data-focus-town')!==town,first,{timeout:5500});
    assert.equal(catalogueRequests,requests,'visual rotation must not call the catalog');
    const second=await radar.getAttribute('data-focus-town');
    const town=radar.locator('.tcRadarTowns button').first();
    await town.click();
    await page.waitForFunction(()=>document.querySelector('#tc-results-title')?.textContent.includes('Angol'));
    await radar.scrollIntoViewIfNeeded();
    await page.waitForTimeout(3200);
    assert.equal(await radar.getAttribute('data-focus-town'),'Angol');
    assert.equal(await radar.getAttribute('data-rotating'),'false');
    nativeRadar={tested:true,first,second,manualTown:'Angol',manualSelectionPaused:true,noCatalogRequestPerRotation:true};
    await page.locator('.tcClearFilters').click();
    await page.emulateMedia({reducedMotion:'reduce'});
    for(const [name,heading] of [['Ofrecer mi trabajo','Ofrezco mi trabajo'],['Necesito contratar','Necesito trabajadores'],['Promocionar negocio','Promociona tu negocio en Trabajo Cerca']]) {
      await page.getByRole('navigation',{name:'Qué necesitas hacer'}).getByRole('button',{name,exact:true}).click();
      await page.getByRole('heading',{name:heading,exact:true}).waitFor();
      await page.getByRole('button',{name:'Cerrar',exact:true}).first().click();
    }
  }
  const manifestResponse=await page.request.get(base+'manifest.webmanifest');
  assert.equal(manifestResponse.status(),200);
  const manifest=await manifestResponse.json(), icons=[];
  for(const icon of manifest.icons) {
    const url=new URL(icon.src,base).href;
    const decoded=await page.evaluate(async url=>{const image=new Image();image.src=url;try{await image.decode();return {width:image.naturalWidth,height:image.naturalHeight,ok:true};}catch{return {ok:false};}},url);
    icons.push({url,...decoded});
    if(applied)assert(decoded.ok,'active PWA icon cannot decode: '+url);
  }
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
  const cdp=await context.newCDPSession(page);await cdp.send('Page.enable');
  const installability=await cdp.send('Page.getInstallabilityErrors');
  if(applied)assert.deepEqual(installability.installabilityErrors,[]);
  if(applied)assert.deepEqual(errors,[]);
  const report={checkedAt:new Date().toISOString(),url:base,applied,expectedCache:'trabajo-cerca-shell-ui-20261024',widths,rows,errors,serverErrors,icons,installability,nativeRadar,realNativeSdk:true,syntheticListings:0,validFormSubmissions:0,productionWrites:0,measurementRequestsSuppressed:suppressed.length,physicalOsInstallationTested:false,pushDeliveryTested:false};
  writeFileSync('qa-output/deployed-ui/report.json',JSON.stringify(report,null,2));
  console.log('DEPLOYED_UI_PROOF '+JSON.stringify(report));
  await context.close();
} catch(error) {
  writeFileSync('qa-output/deployed-ui/failure.json',JSON.stringify({message:String(error),rows,errors,serverErrors},null,2));
  throw error;
} finally { await browser.close(); }
