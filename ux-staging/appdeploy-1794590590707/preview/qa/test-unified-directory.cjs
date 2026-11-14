const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('src/App.tsx'),directory=read('src/local-directory.tsx'),backend=read('backend/local-directory.ts');
let passed=0;
function check(name,fn){fn();passed++;console.log('PASS '+name)}
for(const p of ['src/App.tsx','src/local-directory.tsx','backend/local-directory.ts']){
 check('TSX/TS valid '+p,()=>{
 const file=ts.createSourceFile(p,read(p),ts.ScriptTarget.ES2022,true,p.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 assert.equal(file.parseDiagnostics.length,0,file.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\\n')).join('\\n'));
 });
}
check('Four mobile destinations uniquely represent four actions',()=>{
 for(const name of ['Empleos</span>','Personas</span>','Directorio</span>','Publicar</span>'])assert(app.includes(name));
 assert(!app.includes("className='tcMobilePublishAction'"));
});
check('Desktop has unified directory',()=>assert(app.includes('Servicios y negocios</button>')&& !app.includes('>Comercio local</button>')));
check('Publish directly routes services to owner form',()=>assert(app.includes("openLocalDirectory('all',true)")));
check('Public directory includes both kinds but only approved records',()=>{
 assert(backend.includes("query.kind === 'all' ? null"));
 assert(backend.includes("item.status === 'approved' && (!kind || item.kind === kind)"));
});
check('Pending owner preview stays protected by owner token',()=>{
 const m=backend.slice(backend.indexOf('export async function localDirectoryStatus'),backend.indexOf('export async function localDirectoryRemove'));
 assert(m.includes('sha(token) !== entry.ownerHash'));
 assert(m.includes('storage.url'));
 assert(m.includes('previewPhotos'));
 assert(!m.includes('phone:')&&!m.includes('email:'));
});
check('Owner can view private pending card before moderation',()=>assert(directory.includes('tcDirectoryOwnedPreview')&&directory.includes('Pendiente de aprobación')&&directory.includes('previewPhotos')));
check('Current owners cannot rate their own listing from same device',()=>assert(directory.includes("!localStorage.getItem('tc_directory_owner_' + entry.id)")));
check('Inline rating offers three clear options, not star dropdown',()=>{
 for(const label of ["label:'👍 Bueno'","label:'😐 Regular'","label:'👎 Malo'"])assert(directory.includes(label),label);
 assert(!directory.includes('Estrellas<select'));
 assert(directory.includes("reviewId===entry.id"));
});
check('Existing anti-abuse server rating validations preserved',()=>{
 assert(backend.includes("if (digest === entry.ownerEmailHash)"));
 assert(backend.includes("if (!emailValid(email)"));
 assert(backend.includes("input.hired !== true"));
});
check('Contact details not published in catalog',()=>{
 const m=backend.slice(backend.indexOf('export async function listLocalDirectory'),backend.indexOf('export async function createLocalDirectory'));
 assert(!m.includes('email: item.email'));assert(!m.includes('phone: item.phone'));
});
check('Search local records by title/category/description',()=>{
 assert(directory.includes('setSearchText'));
 assert(directory.includes('visibleListings'));
});
check('Twelve approved municipalities, Quilaco excluded',()=>{
 assert(!directory.includes("'Quilaco'"));
 assert(directory.includes("'Angol'"));
 assert(directory.includes("'Nacimiento'"));
});
console.log(passed+' unified-directory contracts passed');
