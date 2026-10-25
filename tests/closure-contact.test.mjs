import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const path='integrations/appdeploy/house-ads/backend/';
const src=readFileSync(path+'index.ts','utf8');
function func(name,context){const start=src.indexOf('function '+name+'('),end=src.indexOf('\n}',start)+2;return vm.runInNewContext('('+stripTypeScriptTypes(src.slice(start,end),{mode:'strip'})+')',context);}
const retention=stripTypeScriptTypes(readFileSync(path+'offer-retention.ts','utf8'),{mode:'strip'}).replace(/^export /gm,'');
const {offerRetentionReason}=vm.runInNewContext('(function(){'+retention+';return {offerRetentionReason};})()',{Date});
const active=func('isCurrentlyActive',{Date});
const project=func('projectFeedListing',{isCurrentlyActive:active,publicRecord:x=>({...x,contact:undefined,hasContact:!!x.contact}),offerRetentionReason,publicJobExclusion:()=>null,MARKET_PLACES:['Angol'],PILOT:['Angol'],normalizeText:x=>String(x||''),unsafeContentReason:()=>null,parseDiscoveryDate:Date.parse,knownFirstPublication:x=>x.createdAt,offerRecheckDue:()=>false,Date});
const start=src.indexOf('async ({ params, body }) => {',src.indexOf("'POST /api/listings/:id/contact'")),end=src.indexOf('\n  }],',start)+4;
const handlerCode=stripTypeScriptTypes(src.slice(start,end),{mode:'strip'});
const record=(extra={})=>({id:'isolated-id',kind:'job_offer',active:true,verified:true,review:false,sourcePublishedAt:'2026-10-20T00:00:00Z',workCommunes:['Angol'],createdAt:new Date().toISOString(),contact:'isolated@example.invalid',...extra});
async function reveal(item,entry=true){let gets=0;const handler=vm.runInNewContext('('+handlerCode+')',{cleanClientToken:x=>x,allowBurst:()=>true,readPublicFeedEntry:async()=>entry?{source:'radar_jobs',sourceId:'isolated-id',item:{hasContact:true}}:null,db:{get:async()=>{gets++;return [item];}},projectFeedListing:project,json:data=>({statusCode:200,data}),error:(message,statusCode)=>({statusCode,message})});return {response:await handler({params:{id:'isolated-id'},body:{clientToken:'isolated-client'}}),gets};}
test('a pending job cannot reveal contact even through an older public page',async()=>{const result=await reveal(record({review:true,verified:false}));assert.equal(result.response.statusCode,404);assert(!JSON.stringify(result.response).includes('@'));});
test('unknown or unpublished ID is rejected before reading private source',async()=>{const r=await reveal(record(),false);assert.equal(r.response.statusCode,404);assert.equal(r.gets,0);});
test('inactive, expired and consent-revoked contacts cannot be revealed',async()=>{for(const extra of [{active:false},{sourceValidThrough:'2020-01-01T00:00:00Z'},{contactPublicationConsent:false}])assert.equal((await reveal(record(extra))).response.statusCode,404);});
test('eligible historical contacts and explicitly consented contacts still work',async()=>{for(const extra of [{},{contactPublicationConsent:true}])assert.equal((await reveal(record(extra))).response.statusCode,200);});
test('pending community contributions and reviewed profiles stay out of public projection',()=>{for(const kind of ['candidate','worker_available','worker_need','service_request'])assert.equal(project(record({kind,review:true})),null);});
