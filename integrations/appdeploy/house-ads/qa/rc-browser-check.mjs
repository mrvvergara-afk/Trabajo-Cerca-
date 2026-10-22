import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync,writeFileSync} from 'node:fs';
const browser=await chromium.launch({headless:true,...(existsSync('/usr/bin/google-chrome')?{executablePath:'/usr/bin/google-chrome'}:{})});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.addInitScript(()=>{window.houseFixture='admin';window.rcViolations=[];document.addEventListener('securitypolicyviolation',e=>window.rcViolations.push({directive:e.violatedDirective,resource:e.blockedURI}));});
 await page.goto('http://127.0.0.1:4174/?listing=layout-fixture-1',{waitUntil:'networkidle'});
 await page.getByRole('dialog',{name:'Detalle de Puesto de ensayo 2 · solo prueba visual'}).waitFor();
 const cdp=await context.newCDPSession(page);await cdp.send('Page.enable');
 const manifest=await cdp.send('Page.getAppManifest');assert.deepEqual(manifest.errors,[]);
 await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
 await page.evaluate(async()=>{if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));await fetch('/api/qa/cache-probe');});
 const diagnostics=await cdp.send('Page.getInstallabilityErrors');
 const significant=(diagnostics.installabilityErrors||[]).filter(e=>!['not-in-main-frame','in-incognito-mode'].includes(e.errorId));assert.deepEqual(significant,[]);
 const seo=await page.evaluate(async()=>{
  const robots=await fetch('/robots.txt'),sitemap=await fetch('/sitemap.xml');return {robotsStatus:robots.status,robots:await robots.text(),sitemapStatus:sitemap.status,sitemap:await sitemap.text()};
 });assert.equal(seo.robotsStatus,200);assert.equal(seo.sitemapStatus,200);assert(seo.robots.includes('Disallow: /'));assert(!/admin|ownerToken|contact/.test(seo.sitemap));
 const violations=await page.evaluate(()=>window.rcViolations);assert.deepEqual(violations,[]);assert.deepEqual(errors,[]);
 const cacheKeys=await page.evaluate(async()=>{const all=[];for(const key of await caches.keys()){const cache=await caches.open(key);all.push(...(await cache.keys()).map(r=>new URL(r.url).pathname));}return all;});assert(!cacheKeys.some(p=>p.startsWith('/api/')||p.includes('__appdeploy')));
 const report={checkedAt:new Date().toISOString(),fixturesOnly:true,deployed:false,productionWrites:0,sharedListingOpened:true,staticSitemapStatus:seo.sitemapStatus,staticRobotsStatus:seo.robotsStatus,indexingDisabled:true,cspViolations:violations,pageErrors:errors,manifestErrors:manifest.errors,chromiumInstallabilityErrors:significant,serviceWorkerReady:true,noPrivateApiCached:true,osInstallationTested:false,realSdkUsed:false};
 writeFileSync('qa-output/rc-browser.json',JSON.stringify(report,null,2));console.log('RC_BROWSER_PROOF '+JSON.stringify(report));await context.close();
}finally{await browser.close();}
