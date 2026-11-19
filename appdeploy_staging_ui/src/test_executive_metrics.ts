import assert from 'node:assert/strict';
import {executiveKpis,cityCounts,knownCount,MAIN_CITIES} from './executive-metrics';
const missing=executiveKpis();
assert.equal(missing.length,5);
assert.equal(missing[0].value,'Sin datos');
assert.equal(missing[1].value,'Sin datos');
assert.equal(missing[2].value,'Sin datos');
const cards=executiveKpis({publicVisible:102,pending:21,campaigns:3,requests:2});
assert.equal(cards[0].value,'102');
assert.equal(cards[1].value,'Sin datos');
assert.equal(cards[2].value,'Sin datos');
assert.equal(cards[3].value,'21');
assert.equal(cards[4].value,'3');
assert.equal(knownCount(-1),'Sin datos');
assert.equal(knownCount('123'),'Sin datos');
assert.equal(knownCount(0),'0');
const city=cityCounts({communes:[
 {city:'Angol',publicJobs:8,sourceChecked:4,sourceConfigured:8,sourceFailed:1},
 {city:'Temuco',publicJobs:101,sourceChecked:50,sourceConfigured:50},
 {city:'Los Ángeles',publicJobs:33},
 {city:'Nacimiento',publicJobs:0,sourceChecked:0,sourceConfigured:9,sourceFailed:0}
]});
assert.equal(city.length,12);
assert.deepEqual(city.map(r=>r.city),[...MAIN_CITIES]);
assert.equal(city[0].visible,'8');
assert.equal(city.find(r=>r.city==='Nacimiento')?.visible,'0');
assert.equal(city.find(r=>r.city==='Ercilla')?.visible,'Sin datos');
assert(!city.some(r=>r.city==='Temuco'||r.city==='Los Ángeles'));
console.log('EXECUTIVE_KPI_CONTRACT_PASS',city.length);
