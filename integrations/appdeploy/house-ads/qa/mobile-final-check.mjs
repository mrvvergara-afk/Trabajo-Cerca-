import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
const before=process.argv.includes('--before'),phase=before?'before':'after',base=`http://127.0.0.1:${before?4175:4174}`,widths=[360,390,430,768,1366,1440];
mkdirSync('qa-output/mobile-final',{recursive:true});
const browser=await chromium.launch({headless:true,...(existsSync('/usr/bin/google-chrome')?{executablePath:'/usr/bin/google-chrome'}:{})});
const rows=[];
try{for(const width of widths){
 const context=await browser.newContext({viewport:{width,height:width<800?844:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname==='127.0.0.1')return r.continue();if(u.hostname==='mtraiguen.cl')return r.fulfill({contentType:'image/png',body:readFileSync('public/icon-192.png')});return r.abort();});
 await page.addInitScript(()=>{window.houseFixture='territory';sessionStorage.setItem('tc-house-turn','-1');});
 await page.goto(base,{waitUntil:'networkidle'});await page.waitForFunction(()=>document.querySelector('.tcActivityStrip')?.textContent.includes('26 ofertas disponibles'));
 const shot=async(name,locator)=>{if(locator){await locator.scrollIntoViewIfNeeded();await locator.screenshot({path:`qa-output/mobile-final/${phase}-${width}-${name}.png`});}else await page.screenshot({path:`qa-output/mobile-final/${phase}-${width}-${name}.png`});};
 await shot('home');
 const heroHeight=await page.locator('.neoHero').evaluate(e=>e.getBoundingClientRect().height);
 const card=page.locator('[data-offer-id="territory-0"]');await shot('card',card);const cardHeight=await card.evaluate(e=>e.getBoundingClientRect().height);
 await shot('results',page.locator('.neoControlDeck'));
 const radar=page.locator('#neo-radar');await shot('radar',radar);
 const geometry=await radar.evaluate(e=>{const d=e.querySelector('.tcRadarDial').getBoundingClientRect(),t=e.querySelector('.tcRadarTowns'),b=t.getBoundingClientRect();return {dialHeight:d.height,dialWidth:d.width,townsTop:b.top,dialBottom:d.bottom,innerScroll:t.scrollHeight>t.clientHeight+1,points:[...e.querySelectorAll('.tcRadarPoint,i')].map(x=>x.getBoundingClientRect().width),townCount:t.querySelectorAll('button').length};});
 await shot('house',page.locator('.tcHouseAd').last());
 await shot('secondary',page.locator('#tc-other-cities'));
 await shot('footer',page.locator('.neoFooter'));
 console.log('MOBILE_GEOMETRY '+JSON.stringify({phase,width,heroHeight,cardHeight,geometry}));
 if(!before){
  assert.equal(await page.locator('.tcClearFilters').count(),0,'default clear filter must be hidden');
  assert.equal(geometry.townCount,13);assert.equal(geometry.innerScroll,false);assert(Math.abs(geometry.dialWidth-geometry.dialHeight)<1);assert(geometry.points.every(n=>n<=10),'oversized radar points');
  if(width<=800)assert(geometry.townsTop>=geometry.dialBottom,'towns must be below radar');
  const townButtons=radar.locator('.tcRadarTowns button');for(let i=0;i<13;i++){const b=townButtons.nth(i);assert(await b.isVisible());assert.equal(await b.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);}
  assert.equal(await radar.locator('.tcRadarSweep').evaluate(e=>getComputedStyle(e).animationName),'none','reduced motion');
  await radar.getByRole('button',{name:'Lumaco 12 ofertas',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#tc-results-title')?.textContent.includes('Lumaco'));
  assert((await page.locator('.tcResultStatus').first().innerText()).includes('12 resultados'));
  await page.locator('.tcClearFilters').click();await page.waitForFunction(()=>!document.querySelector('.tcClearFilters'));
  assert((await page.locator('.tcResultStatus').first().innerText()).includes('26 resultados'));
  const search=page.locator('.neoFilterSearch input');await search.fill('Cargo sintético 25');await page.waitForFunction(()=>document.querySelectorAll('.neoJobCard').length===1);await page.locator('.tcClearFilters').click();assert.equal(await search.inputValue(),'');
  const cities=page.locator('#tc-other-cities');await cities.locator('summary').click();assert(await cities.evaluate(e=>e.open));assert.equal(await cities.getByRole('button',{name:/Victoria/}).count(),0);assert.equal(await cities.getByRole('button',{name:/Los Ángeles/}).count(),1);assert.equal(await cities.getByRole('button',{name:/Temuco/}).count(),1);assert.equal(await cities.locator('summary').evaluate(e=>getComputedStyle(e,'::after').content),'"−"');await shot('cities-open',cities);await cities.locator('summary').click();assert.equal(await cities.evaluate(e=>e.open),false);
  const news=page.locator('#actualidad-laboral');await news.locator('summary').click();assert(await news.evaluate(e=>e.open));await news.locator('summary').click();assert.equal(await news.evaluate(e=>e.open),false);
  assert.equal(await page.locator('.neoJobCard .neoArtPhoto').count(),0);
  await shot('dates-checked',card);const dates=card.locator('.tcOfferDates');assert.equal(await dates.locator(':scope > span').count(),3);assert((await dates.textContent()).includes('Última comprobación:'));assert(await dates.evaluate(e=>e.getBoundingClientRect().height<=parseFloat(getComputedStyle(e).lineHeight)*3+2*parseFloat(getComputedStyle(e).rowGap||'0')+1),'dates exceed three lines');
  assert(await page.locator('.neoFooter button').evaluateAll(es=>es.every(e=>parseFloat(getComputedStyle(e).fontSize)>=12)),'legal labels too small');await page.locator('.neoFooter').scrollIntoViewIfNeeded();const footer=await page.locator('.neoFooter').boundingBox(),nav=await page.locator('.neoMobileNav').boundingBox();if(nav){assert(await page.locator('.neoMobileNav button').evaluateAll(es=>es.every(e=>{const color=getComputedStyle(e).color.match(/[\d.]+/g).slice(0,3).map(Number);const lum=c=>{const v=c/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};const l=.2126*lum(color[0])+.7152*lum(color[1])+.0722*lum(color[2]);const bg=getComputedStyle(e.closest('.neoMobileNav')).backgroundColor.match(/[\d.]+/g).slice(0,3).map(Number);const background=.2126*lum(bg[0])+.7152*lum(bg[1])+.0722*lum(bg[2]);return (Math.max(l,background)+.05)/(Math.min(l,background)+.05)>=4.5;})),'bottom navigation text contrast');assert(footer.y+footer.height<=nav.y+1,'footer covered');assert(nav.height<=56);const buttons=page.locator('.neoMobileNav button');for(let i=0;i<4;i++)assert((await buttons.nth(i).boundingBox()).height>=44);}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'horizontal overflow');
  const clipped=await page.locator('.neoTabs button,.tcQuickActions button,.neoJobFacts b,.neoFooter p,.tcRadarTowns button,.neoMobileNav button').evaluateAll(es=>es.filter(e=>e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1).map(e=>({text:e.textContent,sw:e.scrollWidth,cw:e.clientWidth,sh:e.scrollHeight,ch:e.clientHeight})));
  assert.deepEqual(clipped,[],'clipped essential labels');assert.deepEqual(errors,[]);
  const baseline=JSON.parse(readFileSync('qa-output/mobile-final/before.json')).rows.find(x=>x.width===width);if(width<=800){assert(heroHeight<baseline.heroHeight,'hero not compacted');assert(cardHeight<=baseline.cardHeight,'card not compacted');}
 }
 rows.push({width,heroHeight,cardHeight,radar:geometry,errors,checks:before?'baseline capture':'passed'});await context.close();
}
writeFileSync(`qa-output/mobile-final/${phase}.json`,JSON.stringify({phase,baselineCommit:'5facee26be7b7d1b1cc6694310b99fd79697747e',realBrowser:true,actualReactApplication:true,sdk:'isolated existing adapter with synthetic labelled fixtures',productionWrites:0,deployed:false,widths,rows},null,2));
console.log('MOBILE_FINAL_PROOF '+JSON.stringify({phase,rows}));
}finally{await browser.close();}
