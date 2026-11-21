import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyHttp, stableState, summarize, sample, ENVIRONMENTS } from './appdeploy-availability-watch.mjs';

test('valid JSON public feed means available, not guaranteed credit balance', () => {
  const x = classifyHttp(200, { items: [{ id:'x' }] });
  assert.equal(x.state, 'HEALTHY');
  assert.equal(x.httpStatus, 200);
  assert.equal(classifyHttp(200, { error: 'invalid' }).state, 'DEGRADED');
});
test('HTTP 402 retains only safe public platform code', () => {
  const a = classifyHttp(402, { code:'APP_TEMPORARILY_UNAVAILABLE' });
  assert.deepEqual(a, { state:'DEGRADED',
    code:'APP_TEMPORARILY_UNAVAILABLE', httpStatus:402 });
  assert.equal(classifyHttp(402, { code:'secret_token=123' }).code, 'HTTP_402');
});
test('two healthy samples recover; persistent 402 is degraded', () => {
  const ok = classifyHttp(200, { items:[] }), blocked = classifyHttp(402, { code:'APP_TEMPORARILY_UNAVAILABLE' });
  const first = { laboratorio: ok, oficial: ok };
  const down = { laboratorio: blocked, oficial: ok };
  assert.equal(stableState(first,first), 'HEALTHY');
  assert.equal(stableState(down,down), 'DEGRADED');
  assert.equal(stableState(first,down), 'INCONCLUSIVE');
  assert.equal(stableState({laboratorio:blocked},first), 'INCONCLUSIVE');
});
test('network failure never turns into invented monthly or daily credit value', () => {
  const x = classifyHttp(0,null);
  assert.equal(x.state,'DEGRADED');
  const report = summarize({laboratorio:x,oficial:x},{laboratorio:x,oficial:x},'DEGRADED');
  assert.equal(report.environments.laboratorio.code,'CONNECTION_FAILURE');
  assert.equal(report.note.includes('no equivale'),true);
  assert.equal('creditsRemaining' in report,false);
});
test('sampling only reads exactly one endpoint per environment', async () => {
  const paths=[];
  const request=async (url,init)=>{
    paths.push(new URL(url).pathname);
    assert.equal(init.method,'GET');
    return new Response(JSON.stringify({ items:[] }),{
      status:200,headers:{'Content-Type':'application/json'},
    });
  };
  const x=await sample(request);
  assert.equal(paths.length,Object.keys(ENVIRONMENTS).length);
  assert.equal(x.oficial.state,'HEALTHY');
});
