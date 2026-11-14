const fs=require('fs'),path=require('path'),assert=require('assert').strict,ts=require('typescript');
const root=path.resolve(__dirname,'..');const src=p=>fs.readFileSync(path.join(root,p),'utf8');
const banner=src('src/house-advertising.tsx'),inline=src('src/advertising-surfaces.tsx'),
app=src('src/App.tsx'),radar=src('src/ux-territorial-cleanup.css'),bcss=src('src/house-advertising.css');
let passed=0;const test=(name,fn)=>{fn();passed++;console.log('PASS '+name)};
for(const file of ['src/house-advertising.tsx','src/advertising-surfaces.tsx','src/App.tsx'])
 test('TypeScript source parses '+file,()=>{
 const t=ts.createSourceFile(file,src(file),ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
 assert.equal(t.parseDiagnostics.length,0,t.parseDiagnostics.map(e=>ts.flattenDiagnosticMessageText(e.messageText,'\\n')).join('\\n'));
});
test('House campaigns rotate automatically every 18 seconds',()=>{
 assert(banner.includes('window.setInterval'));
 assert(banner.includes('18000'));
 assert(banner.includes('setRotation(value=>(value+1)%120)'));
 assert(banner.includes("document.visibilityState!=='visible'"));
});
test('No pause/restart control is rendered anywhere',()=>{
 for(const text of [banner,inline,app]){
  assert(!text.includes('Pausar carrusel'));
  assert(!text.includes('Reanudar campañas'));
  assert(!text.includes('onToggleRotation'));
  assert(!text.includes('tcHouseRotateButton'));
 }
});
test('Featured house campaign gets locally hosted illustration and 2-image collage',()=>{
 assert(banner.includes('tcCampaignFallbackArt'));
 assert(banner.includes('tcHouseImageCollage'));
 assert(banner.includes("'/house-creatives/'+localName+'.svg'"));
 assert(bcss.includes('tcCampaignFallbackArt'));
});
test('Inline house campaigns have on-site image fallback',()=>{
 assert(inline.includes('tcHouseFallbackThumb'));
 const c=src('src/advertising-surfaces.css');
 assert(c.includes('.tcHouseFallbackThumb'));
});
test('Radar label for Nacimiento is legible at mobile breakpoints',()=>{
 assert(radar.includes('Hotfix radar:'));
 assert(radar.includes('grid-template-columns:repeat(3,minmax(0,1fr))'));
 assert(radar.includes('font-size:clamp(11px,2.95vw,13px)'));
});
test('Official brand is not hidden from expanded footer',()=>{
 assert(radar.includes('.tcCompactFooter .tcFooterBrand'));
 assert(radar.includes('display:flex!important'));
 assert(app.includes('<StitchBrand subtitle='));
});
test('Public job/source/catalog/data not changed',()=>{
 assert(app.includes('compactWorkplaceLabel(item.workLocation,item.workCommunes)'));
 assert(app.includes('<TerritorialRadar stats={normalizedRadarStats}'));
 assert(app.includes('<LocalDirectory'));
});
console.log('HOTFIX_QA '+passed+' contracts passed');
