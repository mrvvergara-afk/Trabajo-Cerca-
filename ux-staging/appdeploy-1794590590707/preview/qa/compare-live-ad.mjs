import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
const url='https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const results=[];
try{
 for(const width of [320,390]){
  const context=await browser.newContext({viewport:{width,height:850},serviceWorkers:'block',reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('.tcStitchShell').waitFor({state:'visible',timeout:25000});
  const ad=page.locator(".tcLocalAdvertising.tcCommercialCard[data-placement='search']").first();
  await ad.waitFor({state:'visible',timeout:20000});
  const before=await ad.boundingBox();
  await page.addStyleTag({path:path.resolve('src/ux-compact-2026-11.css')});
  const after=await ad.boundingBox();
  assert(before&&after,'Cannot inspect commercial region');
  assert(after.height<before.height && after.height<=205,'Commercial slot did not shrink enough '+JSON.stringify({before,after}));
  const header=await page.locator('.neoBrand').first().boundingBox();
  const place=await page.locator('.tcMobilePlace').boundingBox();
  assert(header&&place&&header.x+header.width<=place.x+2,'Header overlaps municipality selector');
  const dest=path.resolve('qa/captures-live-ad');
  fs.mkdirSync(dest,{recursive:true});
  await page.screenshot({path:path.join(dest,'ad-compact-'+width+'.png'),animations:'disabled'});
  results.push({width,heightBefore:Math.round(before.height),heightAfter:Math.round(after.height),ratio:Number((after.height/before.height).toFixed(2))});
  console.log('PASS actual live commercial CSS '+JSON.stringify(results.at(-1)));
  await context.close();
 }
}finally{await browser.close();}
console.log('Visual compact ratio results '+JSON.stringify(results));
