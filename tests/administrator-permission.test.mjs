import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = stripTypeScriptTypes(readFileSync(new URL('../integrations/appdeploy/administrator-permission.ts', import.meta.url),'utf8'));
const {administratorPermission} = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('anonymous does not fetch or receive an administrative shortcut',async()=>{
  let calls=0;assert.equal(await administratorPermission(false,async()=>{calls++;return {data:{administrator:true}};}),false);assert.equal(calls,0);
});
test('only an explicit positive server response allows the shortcut',async()=>{
  assert.equal(await administratorPermission(true,async()=>({data:{administrator:true}})),true);
  for(const administrator of [false,'true',1,undefined])assert.equal(await administratorPermission(true,async()=>({data:{administrator}})),false);
});
test('expired, forbidden or failed session denies the shortcut',async()=>{
  for(const status of [401,403,500])assert.equal(await administratorPermission(true,async()=>{throw {response:{status}};}),false);
});
test('missing response payload never grants visibility',async()=>{
  assert.equal(await administratorPermission(true,async()=>({})),false);
});
