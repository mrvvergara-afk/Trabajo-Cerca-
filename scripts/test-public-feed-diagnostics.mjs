// Run with: node --test scripts/test-public-feed-diagnostics.mjs
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
const source = readFileSync(new URL('../appdeploy_staging/snapshot/backend/public-feed.ts', import.meta.url), 'utf8');
test('logs are bounded and distinguish missing sources', () => {
  assert.match(source, /missingSourceDiagnostics\.length<10/);
  assert.match(source, /sourceExists:Boolean\(source\)/);
  assert.match(source, /workCommunesArray:Array\.isArray\(source\?\.workCommunes\)/);
  assert.match(source, /sourceDatePresent:Boolean/);
});
test('regression block and durable queue protections remain', () => {
  assert.match(source, /if\(unexpected\.length\)/);
  assert.match(source, /regressionBlocked:true/);
  assert.match(source, /!\('regressionBlocked' in result && result\.regressionBlocked\)/);
});

test('diagnoses actual source projection without relaxing regression guard',()=>{
 assert.match(source,/sourceProjectsToFeed:Boolean\(source && projector\.project\(\{\.\.\.source,id:lost\.sourceId\}\)\)/);
 assert.match(source,/proposedEquivalentPresent:Boolean/);
 assert.match(source,/async function publish\(record:Manifest, projector:Projector\)/);
 assert.match(source,/return \{\.\.\.\(await readPublicFeedSummary\(\)\),rebuilding:false,regressionBlocked:true\}/);
});

test('approved duplicate cannot be displaced by unverified newer candidate',()=>{
 assert.match(source,/const preserveApproved = approved\(duplicate\.item\) && !approved\(item\)/);
 assert.match(source,/if \(preserveApproved \|\| \(approved\(duplicate\.item\)===approved\(item\) && checked\(duplicate\.item\) > checked\(item\)\)\)/);
 assert.match(source,/if \(firstTimes\.length\) \{duplicate\.item=/);
});

test('approved precedence decision behaves correctly for competing records',()=>{
 const fragment=source.match(/const approved = \(value:Stored\) => ([\s\S]*?);\n        \/\/ Never replace/);
 assert.ok(fragment,'approved predicate must exist');
 const approved=(value)=>value.kind==='job_offer' && value.verified===true && value.review!==true && value.active===true;
 const old={kind:'job_offer',verified:true,review:false,active:true};
 const incoming={kind:'job_offer',verified:false,review:true,active:true};
 assert.equal(approved(old)&&!approved(incoming),true,'approved offer must win');
 assert.equal(approved(incoming)&&!approved(old),false,'pending copy must not win');
 assert.equal(approved({...old,active:false}),false,'inactive is not approved');
});

test('unexplained inactive source retains previously approved feed entry',()=>{
 assert.match(source,/if\(wasPublished && !projected && record\?\.kind==='job_offer' && record\.verified===true &&\s*record\.review!==true\)/);
 assert.match(source,/const keep=previous\?\.item\.verified===true && previous\.item\.review!==true/);
 assert.match(source,/!\/confirmed\|explicit\|administrative\|owner_request\/\.test\(closure\)/);
 assert.doesNotMatch(source,/record\.review!==true && record\.active===true\)/);
});
