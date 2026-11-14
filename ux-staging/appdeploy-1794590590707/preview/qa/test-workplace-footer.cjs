const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const helper=read('src/workplace-label.ts');
const compiled=ts.transpileModule(helper,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
const exports={};
vm.runInNewContext(compiled.outputText,{exports,console},{filename:'workplace-label.cjs'});
const {compactWorkplaceLabel:short}=exports;
let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('PASS '+name)};
const cases=[
 ['Angol literal','Angol',[],'Angol'],
 ['Lumaco + Nueva Imperial descriptor','Operaciones de transporte forestal Nueva Imperial/Lumaco',['Lumaco'],'Lumaco / Imperial'],
 ['Victoria business description','Tienda Upa! en la comuna de Victoria',['Victoria'],'Victoria'],
 ['Unaccented Traiguen','trabajo en Traiguen',['Traiguén'],'Traiguén'],
 ['Mininco sublocality','Sector Mininco Collipulli',['Collipulli'],'Mininco'],
 ['Coihue sublocality','Coihue, comuna de Negrete',['Negrete'],'Coihue'],
 ['Capitán Pastene sublocality','Capitán Pastene, comuna de Lumaco',['Lumaco'],'Capitán Pastene'],
 ['Fallback canonical worksite','Operaciones de logística forestal',['Nacimiento'],'Nacimiento'],
 ['Unknown without guessing','Operaciones forestales sin ubicación',[],'Lugar por confirmar'],
 ['No company name in badge','Tienda Upa! en la comuna de Victoria',[],'Victoria'],
 ['No leakage from recruitment area','Planta de equipos',['Renaico'],'Renaico'],
];
for(const [name,location,communes,expected] of cases){
 check(name,()=>assert.equal(short(location,communes),expected));
}
const app=read('src/App.tsx'),css=read('src/ux-territorial-cleanup.css');
check('Badge only transforms visual label; drawer keeps full location',()=>{
 assert(app.includes("compactWorkplaceLabel(item.workLocation,item.workCommunes)"));
 assert(app.includes("<b>{selected.workLocation}</b>"));
 assert(app.includes("title={item.workLocation}"));
});
check('News omitted in standalone mode and hidden in mobile',()=>{
 assert(app.includes("!isStandalone && <details className='tcSecondary tcWebsiteNewsOnly'"));
 assert(css.includes(".tcStitchShell .tcWebsiteNewsOnly{display:none!important;}"));
});
check('Radar remains present but not doubly nested',()=>{
 assert(app.includes("className='tcRadarCompactRegion'"));
 assert(app.includes("<TerritorialRadar stats={normalizedRadarStats}"));
 assert(!app.includes("tcSecondary tcStitchRadarDetails"));
});
check('Footer content remains legally accessible in its own details',()=>{
 assert(app.includes("summary>Información y privacidad</summary>"));
 assert(app.includes("setLegalView('privacy')"));
 assert(app.includes("setLegalView('terms')"));
 assert(app.includes("tc_analytics_consent"));
});
check('Mobile badges have width, two-line limit, and font floor',()=>{
 assert(css.includes(".tcStitchShell .tcWorkplaceLabel"));
 assert(css.includes("-webkit-line-clamp:2"));
 assert(css.includes("max-width:114px"));
});
for(const file of ['src/App.tsx','src/workplace-label.ts']){
 check('TypeScript parses '+file,()=>{
 const parsed=ts.createSourceFile(file,read(file),ts.ScriptTarget.ES2022,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 assert.equal(parsed.parseDiagnostics.length,0,parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\\n')).join('\\n'));
 });
}
console.log('WORKPLACE_FOOTER_QA '+passed+' tests passed');
