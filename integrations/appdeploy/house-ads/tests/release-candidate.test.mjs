import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const moduleOf=async p=>await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(read(p)).replace(/^import .*;$/gm,'')).toString('base64'));
test('security wrapper protects API successes and denials without dropping SDK CORS headers',async()=>{
 const {withSecurityHeaders}=await moduleOf('backend/security-headers.ts');
 for(const statusCode of [200,201,401,403,404,429,503]){
  const r=withSecurityHeaders({statusCode,headers:{'Access-Control-Allow-Origin':'https://example.org','referrer-policy':'unsafe-url'},body:'private-body'});
  assert.equal(r.body,'private-body');assert.equal(r.headers['Access-Control-Allow-Origin'],'https://example.org');assert.equal(r.headers['Cache-Control'],'no-store');assert.equal(r.headers['X-Content-Type-Options'],'nosniff');assert(r.headers['Content-Security-Policy'].includes("frame-ancestors 'none'"));assert.equal(r.headers['X-Robots-Tag'],'noindex, nofollow');assert(!('referrer-policy'in r.headers));
 }
});
test('shared links encode one public ID and discard private or diagnostic query values',async()=>{
 const {listingShareUrl}=await moduleOf('shared/listing-links.ts');
 const u=new URL(listingShareUrl('https://example.org/?ownerToken=secret&admin-proof=1#operacion','public-id'));
 assert.equal(u.search,'?listing=public-id');assert.equal(u.hash,'');assert.throws(()=>listingShareUrl(u.href,'../private'));
});
test('single listing lookup reads only the current public feed and returns no private source fields',async()=>{
 const src=read('backend/public-feed.ts').slice(read('backend/public-feed.ts').indexOf('export async function readPublicFeedItem'));
 const calls=[];const fn=vm.runInNewContext(stripTypeScriptTypes(src).replace(/^export /gm,'')+';readPublicFeedItem;',{allowedSource:source=>source==='community_posts',currentPublicFeedManifest:async()=>({manifest:{pages:[{id:'leaf',keys:['community_posts:public-id']}]}}),db:{get:async(table,ids)=>{calls.push([table,ids]);return [{entries:[{source:'community_posts',sourceId:'public-id',item:{id:'public-id',title:'Public item',hasContact:true}}]}];}}});
 const item=await fn('public-id');assert.equal(item.id,'public-id');assert(!item.contact&&!item.ownerToken);assert.equal(calls[0][0],'public_feed_versions');assert.equal(await fn('private-id'),null);assert.equal(calls.length,1);
});
test('candidate robots and sitemap expose no private URL and remain unindexed before approval',()=>{
 const sitemap=read('public/sitemap.xml'),robots=read('public/robots.txt'),html=read('index.html');
 assert(robots.includes('Disallow: /'));assert(sitemap.includes('<loc>https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/</loc>'));assert(!/admin|operacion|contact|ownerToken|security-proof/.test(sitemap));assert(html.includes('name="robots" content="noindex, nofollow"'));
 assert(html.includes("script-src 'self'"));assert(!html.includes("script-src 'self' 'unsafe-inline'"));
});
