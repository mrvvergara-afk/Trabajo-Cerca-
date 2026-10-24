import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
const ctx=vm.createContext({URL,Date,Buffer,createHash});
for(const name of ['public-source-adapters.ts','local-contact-evidence.ts']) {
  const raw=readFileSync(new URL('../integrations/appdeploy/'+name,import.meta.url),'utf8');
  vm.runInContext(stripTypeScriptTypes(raw,{mode:'strip'}).replace(/^import .*;$/gm,'').replace(/^export /gm,''),ctx);
}
const input=JSON.parse(readFileSync(0,'utf8'));
ctx.validateLocalContactEvidence(input.item,input.now);
process.stdout.write(JSON.stringify({verified:true})+'\n');
