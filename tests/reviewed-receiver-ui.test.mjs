import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const patch=JSON.parse(readFileSync(new URL('../integrations/appdeploy/reviewed-receiver-sdk-deploy-2026-10-20.json',import.meta.url),'utf8'));
const source=patch.files[0].diffs[0].to.slice(patch.files[0].diffs[0].to.indexOf('  const runReviewedDelivery'));
test('the operator uses only the signed receiver SDK route and retains its returned status',async()=>{
 const calls=[];let result,running;
 const h=vm.createContext({api:{post:async(path,body)=>{calls.push({path,body});return{data:{status:'stored_waiting_for_feed'}};}},setReceiverRunning:v=>{running=v;},setReceiverResult:v=>{result=v;},setErrorMessage:()=>{}});
 vm.runInContext(source+'\nthis.run=runReviewedDelivery;',h);await h.run();
 assert.equal(calls.length,1);assert.equal(calls[0].path,'/api/ops/radar-external/consume');
 assert.equal(Object.keys(calls[0].body).length,0);assert.equal(result.status,'stored_waiting_for_feed');assert.equal(running,false);
});
test('an SDK failure is shown as an error rather than a zero-publication success',async()=>{
 let result,error,running;
 const h=vm.createContext({api:{post:async()=>{throw Error('unavailable');}},setReceiverRunning:v=>{running=v;},setReceiverResult:v=>{result=v;},setErrorMessage:v=>{error=v;}});
 vm.runInContext(source+'\nthis.run=runReviewedDelivery;',h);await h.run();
 assert.match(result.error,/No se pudo/);assert.match(error,/conservan/);assert.equal(running,false);assert.equal(result.published,undefined);
});
