// Exact patch-context test against a captured AppDeploy source excerpt.
// Run: node --test scripts/test-feed-patch-context.mjs
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
const fixture=readFileSync(new URL('../appdeploy_staging/fixtures/index-listings-route.ts.txt',import.meta.url),'utf8');
const patch=readFileSync(new URL('../appdeploy_staging/patches/no-false-zero-feed.patch',import.meta.url),'utf8');
function patchBlocks(diff){
  const lines=diff.split('\n');
  const old=[], replacement=[];
  let inHunk=false;
  for(const line of lines){
    if(line.startsWith('@@')){inHunk=true;continue;}
    if(!inHunk || line==='*** End Patch')continue;
    if(line.startsWith('-'))old.push(line.slice(1));
    else if(line.startsWith('+'))replacement.push(line.slice(1));
    else if(line.startsWith(' ')){old.push(line.slice(1));replacement.push(line.slice(1));}
  }
  return [old.join('\n'),replacement.join('\n')];
}
test('the exact removal context exists once in captured AppDeploy route',()=>{
 const [old]=patchBlocks(patch);
 assert.ok(old.length>200);
 assert.equal(fixture.split(old).length-1,1,'Patch drift: upstream route no longer matches');
});
test('applying patch keeps verified staged fallback and rejects fabricated zero',()=>{
 const [old,replacement]=patchBlocks(patch);
 const updated=fixture.replace(old,replacement);
 assert.notEqual(updated,fixture);
 assert.match(updated,/if\(staged && staged\.items\.length\) return json\(staged\)/);
 assert.match(updated,/return error\(.+503\)/);
 assert.doesNotMatch(updated,/totalItems:visible\.length/);
 assert.match(updated,/return query\.fresh === '1' \? json\(feed\)/);
});
