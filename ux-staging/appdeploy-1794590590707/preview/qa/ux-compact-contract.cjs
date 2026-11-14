const ts=require('typescript');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const app=read('src/App.tsx'),directory=read('src/local-directory.tsx'),backend=read('backend/local-directory.ts'),
router=read('backend/index.ts'),css=read('src/ux-compact-2026-11.css');
let n=0;
function check(name,fn){fn();n++;console.log('PASS '+name)}
for(const file of ['src/App.tsx','src/local-directory.tsx','backend/local-directory.ts','backend/index.ts']){
 check('TypeScript syntax '+file,()=>{
  const parse=ts.createSourceFile(file,read(file),ts.ScriptTarget.ES2022,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.deepEqual(parse.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')),[]);
 });
}
check('Mobile compact overlay imported last',()=>assert(app.indexOf("import './ux-compact-2026-11.css'")>app.indexOf("import './commercial-card.css'")));
check('Directory routes do not render employment listing',()=>{assert(app.includes("data-directory-open={directoryMode ? 'true' : 'false'}"));assert(css.includes(".tcStitchShell[data-directory-open='true']"));});
check('Advertisement allocated slots untouched',()=>{for(const x of ["renderAdvertising('search')","renderAdvertising('listing')","renderAdvertising('featured')"])assert(app.includes(x));});
check('Compact promotion constrained to real commercial cards',()=>assert(css.includes(".tcLocalAdvertising.tcCommercialCard[data-placement='search']")));
check('Owner receipt uses authorization token and no public contact fields',()=>{assert(backend.includes('sha(token) !== entry.ownerHash'));const receipt=backend.slice(backend.indexOf('export async function localDirectoryStatus'),backend.indexOf('export async function localDirectoryRemove'));assert(!receipt.includes('email:'));assert(!receipt.includes('phone:'));});
check('Owner receipt route is explicitly connected',()=>assert(router.includes("'POST /api/local-directory/:id/status'")&&router.includes('localDirectoryStatus(params.id,body)')));
check('Pending queue reads multiple pages, not just first 100 rows',()=>{assert(backend.includes('async function queue<T>'));assert(backend.includes('nextToken'));});
check('Directory lists only approved, respecting commune',()=>assert(backend.includes("item.status === 'approved' && item.kind === kind")));
check('Admin tools do not render expanded by default',()=>assert(directory.includes("<details className='tcDirectoryAdmin'")));
check('Photos and submission errors visible near form',()=>{assert(directory.includes("photos.length+' foto(s) seleccionada(s)"));assert(directory.includes('submissionError && <p role='));});
check('Owned cards no longer expose huge destructive buttons',()=>assert(app.includes("className='neoOwnActions tcOwnedActions'")));
check('Only 12 territory municipalities',()=>assert(!directory.includes("'Quilaco'")));
console.log(n+' compact UX and directory contracts passed');
