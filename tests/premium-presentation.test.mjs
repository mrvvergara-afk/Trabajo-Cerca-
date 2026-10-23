import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve('integrations/appdeploy/house-ads');
const dir=mkdtempSync(join(tmpdir(),'tc-presentation-'));
mkdirSync(join(dir,'src'));mkdirSync(join(dir,'shared'));
writeFileSync(join(dir,'shared/house-ads.ts'),readFileSync(join(root,'shared/house-ads.ts')));
writeFileSync(join(dir,'src/house-creative-presentation.ts'),readFileSync(join(root,'src/house-creative-presentation.ts'),'utf8').replace("'../shared/house-ads'","'../shared/house-ads.ts'"));
const {presentHouseCreative}=await import(pathToFileURL(join(dir,'src/house-creative-presentation.ts')).href);
const {HOUSE_DEFAULTS}=await import(pathToFileURL(join(dir,'shared/house-ads.ts')).href);
process.on('exit',()=>rmSync(dir,{recursive:true,force:true}));
test('six existing campaigns keep IDs, destinations and distinct visible resources',()=>{
 assert.equal(HOUSE_DEFAULTS.length,6);assert.equal(new Set(HOUSE_DEFAULTS.map(c=>c.id)).size,6);
 for(const c of HOUSE_DEFAULTS){const v=c.creatives[0];assert.equal(c.type,'HOUSE_AD');assert(v.imageUrl.endsWith('.svg'));assert(readFileSync(join(root,'public',v.imageUrl),'utf8').startsWith('<svg'));assert(['professional','advertiser','employer','explore'].includes(c.goal));}
});
test('legacy untouched campaign receives current presentation and an image without data mutation',()=>{
 const c={id:'a',title:'¿Tienes un oficio o profesión?',message:'¿Tienes un oficio o profesión? Ofrece tus servicios gratis en Trabajo Cerca.',mobileMessage:'Ofrece tu oficio o profesión gratis.',button:'Publicar mis servicios'};const original=structuredClone(c);const output=presentHouseCreative('house-professionals',c);assert.equal(output.title,'¿Buscas trabajo? Hazte visible.');assert(output.imageUrl);assert.deepEqual(c,original);
});
test('administrator custom text and approved resource prevail over defaults',()=>{
 const c={id:'a',title:'Texto aprobado propio',message:'Mensaje propio',mobileMessage:'Mensaje móvil',button:'Consultar',imageUrl:'https://approved.appdeploy.ai/photo.webp',storagePath:'house-creatives/'+'a'.repeat(64)+'.webp'};assert.deepEqual(presentHouseCreative('house-advertisers',c),c);
});
test('withdrawing an image does not silently reactivate the default',()=>{
 const c={...HOUSE_DEFAULTS[0].creatives[0],imageDisabled:true};assert.equal(presentHouseCreative('house-professionals',c).imageUrl,undefined);
});
test('a pending approved storage resource is not replaced by a default URL',()=>{
 const c={...HOUSE_DEFAULTS[0].creatives[0],imageUrl:undefined,storagePath:'house-creatives/'+'a'.repeat(64)+'.webp'};assert.equal(presentHouseCreative('house-professionals',c).imageUrl,undefined);
});
