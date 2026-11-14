import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const BASE='https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let ok=0;
try{
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const validate=async(place,expected)=>{
    await page.goto(BASE+'/?place='+encodeURIComponent(place),{waitUntil:'domcontentloaded',timeout:30000});
    const nav=page.getByRole('navigation',{name:'Navegación móvil de cuatro espacios'});
    await nav.getByRole('button',{name:'Servicios'}).click();
    const dir=page.locator('#local-directory');
    await dir.locator('.tcDirectoryTop').waitFor({state:'visible',timeout:20000});
    await dir.getByRole('heading',{name:'Tortas',exact:true}).waitFor({state:'visible',timeout:20000});
    const card=dir.locator('.tcDirectoryCard').filter({hasText:'Tortas'}).first();
    assert(await card.isVisible(),'Public Tortas card not visible');
    assert.equal(await card.getByRole('heading',{name:'Tortas',exact:true}).count(),1,'Expected approved Tortas title inside card');
    assert((await card.textContent()).includes('Renaico'),'Tortas should be shown as Renaico listing');
    const cards=await dir.locator('.tcDirectoryCard').count();
    console.log('PASS public Tortas appears at '+place+'; approved service, Renaico; total visible cards '+cards);
    ok++;
  };
  await validate('Renaico',true);
  await validate('Todas',true);
  assert.deepEqual(errors,[]);
  console.log('PASS no uncaught JS errors');ok++;
}finally{await browser.close();}
console.log('LIVE_TORTAS '+ok+' checks passed');
