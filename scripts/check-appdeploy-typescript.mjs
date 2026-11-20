// Syntax validation of recovered TypeScript modules (not full AppDeploy type-check).
// Run: npm install --no-save typescript@5.7.3 && node scripts/check-appdeploy-typescript.mjs
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const files = [
  'appdeploy_staging/snapshot/backend/public-feed.ts',
  'appdeploy_staging/snapshot/backend/offer-retention.ts',
  'appdeploy_staging/snapshot/backend/public-source-adapters.ts',
  'appdeploy_staging/snapshot/backend/radar-ingestion.ts',
  'appdeploy_staging/snapshot/shared/territories.ts',
  'appdeploy_staging/snapshot/shared/offer-public-state.ts',
  'appdeploy_staging/snapshot/shared/listing-links.ts',
];
let failures=0;
for (const file of files) {
  const content=readFileSync(file,'utf8');
  const result=ts.transpileModule(content,{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
  const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  if(errors.length){failures+=errors.length;console.error(file,errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,'\n')));}
  else console.log('OK',file);
}
if(failures)process.exitCode=1;
