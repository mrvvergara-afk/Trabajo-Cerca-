import {build} from 'esbuild';
import {mkdirSync} from 'node:fs';
mkdirSync('qa-output/mulchen',{recursive:true});
await build({entryPoints:['qa/mulchen-entry.ts'],bundle:true,platform:'node',format:'esm',outfile:'qa-output/mulchen/test-runtime.mjs',
 plugins:[{name:'isolated-db-and-document-reader',setup(b){
 b.onResolve({filter:/^@appdeploy\/sdk$/},()=>({path:'sdk',namespace:'test'}));
 b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const db=new Proxy({}, {get:(_,key)=>globalThis.__mulchenDb[key]});export const isAppDatabaseError=e=>!!e&&typeof e.code==="string";'}));
 b.onResolve({filter:/motor-b-document$/},()=>({path:'document',namespace:'html-only'}));
 b.onLoad({filter:/.*/,namespace:'html-only'},()=>({contents:'export function extractBDocument(){throw Error("PDF not part of these HTML verification tests")}'}));
 }}]});
await build({entryPoints:['backend/index.ts'],bundle:true,platform:'node',format:'esm',outfile:'qa-output/mulchen/backend.mjs',external:['@appdeploy/sdk','pdfjs-dist/*','tesseract.js']});
await build({entryPoints:['src/main.tsx'],bundle:true,platform:'browser',format:'esm',outdir:'qa-output/mulchen/frontend',loader:{'.svg':'file','.png':'file'},external:['@appdeploy/client']});
