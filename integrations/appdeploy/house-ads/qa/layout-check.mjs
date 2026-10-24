import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
const browser=await chromium.launch({headless:true,...(existsSync('/usr/bin/google-chrome')?{executablePath:'/usr/bin/google-chrome'}:{})});
const results=[];
try {
  for(const viewport of [{width:320,height:568},{width:390,height:844},{width:768,height:1024},{width:1440,height:1000}]) {
    const context=await browser.newContext({viewport});
    const page=await context.newPage();const errors=[];
    page.on('pageerror',e=>{errors.push(e.message);console.error('LAYOUT_ERROR '+e.message);});
    await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    await page.addInitScript(()=>{window.houseFixture='admin';sessionStorage.setItem('tc-house-turn','-1');});
    await page.goto('http://127.0.0.1:4174/',{waitUntil:'networkidle'});
    const header=page.locator('.neoTopbar');const menu=page.locator('.tcSiteMenu');
    const headerRect=await header.boundingBox();assert(headerRect.height<=80,'header_too_tall');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'page_overflow');
    assert.equal(await header.getByRole('button',{name:'Administración',exact:true}).isVisible(),false);
    await menu.locator('summary').click();await menu.getByRole('button',{name:'Administración',exact:true}).waitFor();
    await menu.getByRole('button',{name:'Configurar avisos',exact:true}).waitFor();
    if(viewport.width<=800){const panelBox=await page.locator('.tcSiteMenuPanel').boundingBox();const barBox=await page.locator('.neoMobileNav').boundingBox();assert(panelBox.y+panelBox.height<barBox.y,'menu_hidden_by_bottom_nav');}
    await menu.locator('summary').focus();await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('open'),null);
    const quick=page.getByRole('navigation',{name:'Qué necesitas hacer',exact:true});
    await quick.getByRole('button',{name:'Ofrecer mi trabajo',exact:true}).click();
    await page.getByRole('heading',{name:'Ofrezco mi trabajo',exact:true}).waitFor();
    assert.equal(await page.locator('.neoMobileNav').count(),0,'bottom_nav_over_form');
    await page.getByRole('button',{name:'Cerrar',exact:true}).last().click();
    await quick.getByRole('button',{name:'Necesito contratar',exact:true}).click();
    await page.getByRole('heading',{name:'Necesito trabajadores',exact:true}).waitFor();
    await page.getByRole('button',{name:'Cerrar',exact:true}).last().click();
    await menu.locator('summary').click();await menu.getByRole('button',{name:'Necesito un servicio',exact:true}).click();
    await page.getByRole('heading',{name:'Necesito un servicio',exact:true}).waitFor();
    await page.getByRole('button',{name:'Cerrar',exact:true}).last().click();
    const mobile=viewport.width<=800;
    const nav=page.getByRole('navigation',{name:'Navegación móvil',exact:true});
    let bottomHeight=0;
    if(mobile){
      await nav.waitFor();const rect=await nav.boundingBox();bottomHeight=rect.height;assert(rect.height<=72,'bottom_nav_too_tall');
      assert.equal(await nav.getByRole('button').count(),4);
      await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
      const headerAfter=await header.boundingBox();assert(headerAfter.y+headerAfter.height<=0,'header_still_occupies_screen');
      const footerButton=page.locator('.neoFooter').getByRole('button',{name:'Términos',exact:true});
      const box=await footerButton.boundingBox();assert(box.y+box.height<=rect.y,'footer_hidden_by_navigation '+JSON.stringify({footer:box,nav:rect}));
    }else assert.equal(await nav.isVisible(),false);
    const order=await page.evaluate(()=>{
      const jobs=document.getElementById('neo-jobs');const cities=document.getElementById('tc-other-cities');const news=document.getElementById('actualidad-laboral');
      return Boolean(jobs.compareDocumentPosition(cities)&Node.DOCUMENT_POSITION_FOLLOWING)&&Boolean(cities.compareDocumentPosition(news)&Node.DOCUMENT_POSITION_FOLLOWING);
    });assert(order,'secondary_content_precedes_jobs');
    assert.deepEqual(errors,[]);
    mkdirSync('qa-output',{recursive:true});
    await page.screenshot({path:'qa-output/layout-'+viewport.width+'.png',fullPage:true});
    await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
    await page.screenshot({path:'qa-output/layout-'+viewport.width+'-top.png'});
    results.push({viewport,headerHeight:headerRect.height,bottomHeight,headerScrollsAway:mobile,accountAndAdminInsideMenu:true,professionalEmployerServiceForms:true,secondaryContentAfterJobs:true,footerNotCovered:true,noHorizontalOverflow:true,pageErrors:errors});
    await context.close();
  }
} finally {await browser.close();}
mkdirSync('qa-output',{recursive:true});const report={checkedAt:new Date().toISOString(),fixturesOnly:true,deployed:false,productionWrites:0,views:results};writeFileSync('qa-output/layout.json',JSON.stringify(report,null,2));console.log('COMPACT_LAYOUT_PROOF '+JSON.stringify(report));
