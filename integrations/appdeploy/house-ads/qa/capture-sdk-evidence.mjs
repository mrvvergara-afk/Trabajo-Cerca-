// Observe responses to the existing app's SDK requests. No invented transport,
// credentials, collector invocation, record writes or authentication changes.
import {chromium} from 'playwright';import {existsSync,readFileSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const expected=JSON.parse(readFileSync('../../../output/site-inventory/proof.json','utf8'));assert(expected.feed_read_complete===true);
const ids=new Set(expected.visible_items.filter(x=>x.kind==='job_offer').map(x=>x.id));const rows=new Map(),pending=[];
function extract(value,depth=0){if(depth>7||!value)return;if(typeof value==='string'){if(value.length<1500000&&/^[\[{]/.test(value.trim())){try{extract(JSON.parse(value),depth+1);}catch{}}return;}if(typeof value!=='object')return;
 if(Array.isArray(value.items)){for(const item of value.items){if(item?.kind!=='job_offer'||!ids.has(item.id))continue;
  const safe=Object.fromEntries(['id','kind','origin','source','sourcePublishedAt','firstPublishedAt','createdAt','verified','review','active','revalidationDue','verifiedAt','lastVerifiedAt','externalVerifiedAt','verificationMethod','verificationReason','evidence','evidenceSources'].filter(k=>item[k]!==undefined).map(k=>[k,item[k]]));
  const old=rows.get(item.id);if(!old||Object.keys(safe).length>Object.keys(old).length)rows.set(item.id,safe);
 }}for(const [key,child]of Object.entries(value)){if(key!=='items')extract(child,depth+1);}}
const browser=await chromium.launch({headless:true,...(existsSync('/usr/bin/google-chrome')?{executablePath:'/usr/bin/google-chrome'}:{})});
try{const page=await browser.newPage();page.on('response',response=>{if((response.headers()['content-type']||'').includes('json'))pending.push((async()=>{try{extract(await response.json());}catch{/* Non-listing responses are ignored. */}})());});
 await page.goto('https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/?radar-proof=1#operacion',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>{try{const x=JSON.parse(document.getElementById('radar-live-check')?.textContent||'null');return x?.feedReadComplete===true&&!x.feedReadError;}catch{return false;}},undefined,{timeout:60000});
 await Promise.all(pending);const operator=JSON.parse(await page.locator('#radar-live-check').innerText());
 assert.equal(operator.feed.manifestId,expected.feed_manifest,'snapshot changed during read; do not merge observations');
 assert.equal(rows.size,ids.size,'SDK raw evidence read incomplete');assert([...ids].every(id=>rows.has(id)));
 const report={checkedAt:new Date().toISOString(),sdkRequestsInitiatedByExistingApp:true,readOnly:true,manifest:expected.feed_manifest,complete:true,records:[...rows.values()],newOffers:0,approvals:0};writeFileSync('qa-output/sdk-public-evidence.json',JSON.stringify(report,null,2));console.log('SDK_EVIDENCE_READ '+JSON.stringify({manifest:report.manifest,count:rows.size,complete:true}));
}finally{await browser.close();}
