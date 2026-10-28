import {build as viteBuild} from 'vite';
import { build } from 'esbuild';
import { readFileSync,mkdirSync,writeFileSync } from 'node:fs';
mkdirSync('qa-output/radar',{recursive:true});
await build({entryPoints:['backend/index.ts'],bundle:true,platform:'node',format:'esm',outfile:'qa-output/radar/backend.mjs',external:['@appdeploy/sdk','pdfjs-dist/*']});
await build({entryPoints:['src/main.tsx'],bundle:true,platform:'browser',format:'esm',outdir:'qa-output/radar/frontend',loader:{'.svg':'file','.png':'file'},external:['@appdeploy/client']});
const sources=['backend/public-feed.ts','backend/free-public-sources.ts','backend/shadow-publish.ts','backend/shadow-pdf.ts','backend/shadow-radar.ts','backend/radar-trace.ts','backend/offer-retention.ts','backend/offer-identity.ts','backend/publication-preflight.ts','backend/evidence-job.ts','backend/public-source-verifier.ts','backend/index.ts','backend/radar-ingestion.ts','backend/public-source-adapters.ts','shared/radar-source-inventory.ts','src/feed-inventory.ts','src/App.tsx','tests/tests.json','src/legal-responsible.ts','src/territorial-exploration.ts'];
const files=sources.map(path=>({filename:path,content:readFileSync(path,'utf8')}));
writeFileSync('qa-output/radar/reviewable-source-package.json',JSON.stringify({appId:'trabajo-cerca-laboratorio-3ojgro',baseVersion:'1793152775717',deployed:false,files},null,2));

console.log('RADAR_LOCK_JSON '+JSON.stringify(JSON.parse(readFileSync('package-lock.json','utf8'))));

await viteBuild({configFile:'vite.config.ts',build:{outDir:'qa-output/radar/vite',emptyOutDir:true,rollupOptions:{external:['@appdeploy/client']}}});
