import assert from 'node:assert/strict';
import {adaptEngine,nonnegative,health} from './engine-metrics-contract';
const now=new Date().toISOString();
assert.equal(nonnegative(7),7);
assert.equal(nonnegative('7'),null);
assert.equal(adaptEngine('GEMINI',{state:'import_completed',at:now,received:8,queued:2}).counts.publishedConfirmed,null);
assert.equal(adaptEngine('CHATGPT',null).counts.attempted,null);
assert.equal(health('D',now), 'recent');
console.log('PRODUCER_CONTRACT_UNVERIFIED_PUBLISH_PASS');
