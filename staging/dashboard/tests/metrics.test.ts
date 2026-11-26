import test from 'node:test';
import assert from 'node:assert/strict';
import {motorEfficiency,territorialPresence,managementAlerts,MAIN_CITIES,percent} from '../src/executive-metrics.ts';
test('unknown and zero differ',()=>{assert.equal(percent(0,10),0);assert.equal(percent(null,10),null);assert.equal(percent(10,0),null);assert.equal(percent(11,10),null);});
test('all six motors represented without fabricated data',()=>{const rows=motorEfficiency(null);assert.equal(rows.length,6);assert.equal(rows[0].coverage,'Sin datos');assert.equal(rows[1].coverage,'No aplica');assert.equal(rows[1].reviewed,'Sin datos');});
test('territorial coverage requires complete unique territory',()=>{const rows=MAIN_CITIES.map((city,i)=>({city,visible:i?'0':'2',audited:'0',expected:'0',failed:'0'}));assert.equal(territorialPresence(rows,true),'1 / 12');assert.equal(territorialPresence(rows,false),'Sin datos');assert.equal(territorialPresence([...rows.slice(0,11),rows[0]],true),'Sin datos');});
test('missing telemetry and feed surface alerts',()=>{assert.deepEqual(managementAlerts(null,false,null).map(a=>a.key),['telemetry','feed']);});
