import test from 'node:test';
import assert from 'node:assert/strict';
import {commercialTotals} from '../src/commercial-management-metrics.ts';
test('deduplicates identical records',()=>{const r={id:'a',impression:10,click:2};assert.equal(commercialTotals([r,r],true).ctr,20);});
test('no impressions or missing rows do not fabricate CTR',()=>{assert.equal(commercialTotals([],true).impressions,null);assert.equal(commercialTotals([{id:'a',impression:0,click:0}],true).ctr,null);});
test('partial and inconsistent data flagged',()=>{assert.equal(commercialTotals([{id:'a',impression:10,click:2}],false).complete,false);assert.equal(commercialTotals([{id:'a',impression:10,click:2},{id:'a',impression:11,click:2}],true).impressions,null);});
