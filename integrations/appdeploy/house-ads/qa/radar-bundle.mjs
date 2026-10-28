import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
mkdirSync('qa-output/radar',{recursive:true});
await build({entryPoints:['qa/radar-entry.ts'],bundle:true,platform:'node',format:'esm',outfile:'qa-output/radar/core.mjs',packages:'external',
  plugins:[{name:'isolated-database',setup(b){b.onResolve({filter:/^@appdeploy\/sdk$/},()=>({path:'sdk',namespace:'test-only'}));b.onLoad({filter:/.*/,namespace:'test-only'},()=>({contents:'export const db=globalThis.__radarDB;',loader:'js'}));}}]});
