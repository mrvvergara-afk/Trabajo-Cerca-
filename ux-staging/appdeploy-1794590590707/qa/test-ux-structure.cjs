const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const ts=require('typescript');
const ROOT=path.resolve(__dirname,'..');
const file=(p)=>fs.readFileSync(path.join(ROOT,p),'utf8');
const source=file('src/App.tsx'),css=file('src/ux-polish-2026-11.css'),territory=file('src/territorial-exploration.ts');
let passed=0;
function check(name,fn){fn();passed++;console.log('PASS '+name);}
for(const name of ['src/App.tsx','src/local-directory.tsx','src/territorial-exploration.ts','shared/house-ads.ts','shared/ad-images.ts']){
 check('TS syntax '+name,()=>{
  const code=file(name);
  const parsed=ts.createSourceFile(name,code,ts.ScriptTarget.ES2022,true,name.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.equal(parsed.parseDiagnostics.length,0,parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('\n'));
 });
}
check('desktop tabs preserve four public paths',()=>{for(const x of ['Empleos</button>','Oficios y personas</button>','Servicios</button>','Comercio local</button>'])assert(source.includes(x),x)});
check('mobile tabs preserve four public paths',()=>{assert(source.includes('Navegación móvil de cuatro espacios'));for(const x of ['<span>Empleos</span>','<span>Oficios</span>','<span>Servicios</span>','<span>Comercio</span>'])assert(source.includes(x),x)});
check('publish selects all four existing flows',()=>{for(const x of ["setFlow('ofrezco')","setFlow('servicio')","setFlow('trabajadores')","setFlow('aporte')"])assert(source.includes(x),x)});
check('publishing modal is keyboard accessible',()=>{assert(source.includes("event.key==='Tab'"));assert(source.includes("event.key==='Escape'"));assert(source.includes('previousOverflow'));});
check('directory split into lazy chunk',()=>{assert(source.includes("lazy(() => import('./local-directory')"));assert(!source.includes("import { LocalDirectory }"));assert(source.includes("fallback={<div id='local-directory'"));});
check('ads retain search/listing/featured positions',()=>{for(const slot of ['search','listing','featured'])assert(source.includes("renderAdvertising('"+slot+"')"),slot);});
check('anonymous directory visitor does not request admin data',()=>{
 const code=file('src/local-directory.tsx');
 assert(code.includes('auth.getUser()'));
 assert(code.includes('if (active && user) void refreshAdmin()'));
 assert(code.includes("api.get('/api/admin/local-directory')"));
});
check('job list uses worksite rather than recruitment filters',()=>{assert(source.includes("section!=='opportunities'"));assert(source.includes('matchesTerritorialView(item, place, places)'));assert(!territory.includes('...item.recruitmentCommunes'))});
check('original publication date not overwritten with discovery date',()=>{assert(source.includes("item.date !== 'Publicado hoy'"));assert(source.includes("shortDate(item.sourcePublishedAt || '')"));});
check('responsive style is imported after mobile-structure',()=>{assert(source.indexOf("import './ux-polish-2026-11.css'")>source.indexOf("import './mobile-structure.css'"));assert(css.includes('tcMobilePlace'))});
check('advertiser placement logic unchanged from original snapshot',()=>{assert(file('shared/house-ads.ts').includes("placements: ['search','listing']"));});
console.log(passed+' source structure checks passed');