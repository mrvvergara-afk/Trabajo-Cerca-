// The producer and deployed app execute the same deterministic parser.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const modules = ['social-evidence.ts','public-source-adapters.ts','public-source-verifier.ts'];
const context = { URL,Intl,Date,Buffer,createHash };
vm.createContext(context);
for (const name of modules) {
  const source = readFileSync(new URL('../integrations/appdeploy/'+name,import.meta.url),'utf8');
  const code = stripTypeScriptTypes(source,{ mode:'strip' }).replace(/^import .*;$/gm,'').replace(/^export /gm,'');
  vm.runInContext(code,context,{ timeout:1000 });
}
const input = JSON.parse(readFileSync(0,'utf8'));
const result = context.evaluatePublicJob(input.url,input.raw,input.final_url || input.url,input.status ?? 200,input.now);
process.stdout.write(JSON.stringify(result)+'\n');
