import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const context=vm.createContext({URL});
const source=readFileSync(new URL('../integrations/appdeploy/public-source-adapters.ts',import.meta.url),'utf8');
vm.runInContext(stripTypeScriptTypes(source,{mode:'strip'}).replace(/^export /gm,''),context);
const rows=JSON.parse(readFileSync(process.argv[2],'utf8')).visible_items;
const excluded=[],groups=new Map();
for (const item of rows) {
  const reason=context.publicJobExclusion(item);
  if (reason) {excluded.push({id:item.id,reason,url:item.url,title:item.title});continue;}
  if (item.kind!=='job_offer' || !item.url)continue;
  const adapter=context.publicSourceAdapter(item.url);
  const key=item.documentUnitKey ? context.publicFeedIdentity(item.url,item.documentUnitKey)
    : adapter?.family==='local' ? adapter.identityUrl+'\0'+String(item.title)+'\0'+String(item.workLocation)
    : context.publicFeedIdentity(item.url);
  if (!key)continue;
  const ids=groups.get(key)||[];ids.push(item.id);groups.set(key,ids);
}
console.log(JSON.stringify({excluded,duplicates:[...groups].filter(([,ids])=>ids.length>1).map(([identity,ids])=>({identity,ids}))}));
