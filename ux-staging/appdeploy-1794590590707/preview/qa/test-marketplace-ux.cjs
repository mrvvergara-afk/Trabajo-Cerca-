const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const files=['src/local-directory.tsx','src/advertising-surfaces.tsx','src/house-creative-presentation.ts',
 'shared/house-ads.ts','backend/local-directory.ts','backend/index.ts','src/App.tsx'];
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
for(const file of files)check('Parse TS '+file,()=>{
 const tree=ts.createSourceFile(file,read(file),ts.ScriptTarget.ES2022,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 assert.equal(tree.parseDiagnostics.length,0,tree.parseDiagnostics.map(e=>ts.flattenDiagnosticMessageText(e.messageText,'\\n')).join('\\n'));
});
const ui=read('src/local-directory.tsx'),ad=read('src/advertising-surfaces.tsx'),
 defaults=read('shared/house-ads.ts'),presentation=read('src/house-creative-presentation.ts'),
 backend=read('backend/local-directory.ts'),router=read('backend/index.ts'),app=read('src/App.tsx');
check('Public photos have button and zoom lightbox',()=>{
 assert(ui.includes("aria-label={'Ampliar fotografía '"));
 assert(ui.includes("className='tcPhotoLightbox'"));
 assert(ui.includes("aria-modal='true'"));
 assert(ui.includes("event.key==='Escape'"));
 assert(ui.includes("event.key==='ArrowRight'"));
});
check('Owner private photo gallery also tap-to-enlarge',()=>{
 assert(ui.includes("openPhotos(entry.previewPhotos||[]"));
 assert(ui.includes("className='tcDirectoryOwnerPhotos'")||ui.includes('tcDirectoryOwnerPhotos'));
});
check('Five-star rating explicitly visible and selectable',()=>{
 assert(ui.includes("className='tcDirectoryRatingStars'"));
 assert(ui.includes("role='radiogroup'"));
 assert(ui.includes("aria-checked={rating===value}"));
 assert(ui.includes("[1,2,3,4,5].map"));
 assert(!ui.includes("label:'👍 Bueno'"));
});
check('Rating requires email sign-in but not browsing/publishing',()=>{
 assert(ui.includes("auth.signInWithRedirect"));
 assert(ui.includes("if(!reviewer?.email)throw"));
 assert(ui.includes("api.post('/api/local-directory/' + reviewId + '/reviews', {rating,hired})"));
 assert(ui.includes("api.post('/api/local-directory', {"));
 assert(!ui.includes('email: reviewEmail'));
});
check('Reviews protected server side and use verified user email',()=>{
 const route=router.match(/'POST \/api\/local-directory\/:id\/reviews': \[([^\n]+)\]/);
 assert(route&&route[1].includes('requireAuth()'));
 assert(route[1].includes('user?.email'));
 assert(backend.includes('verifiedEmail: string'));
 assert(backend.includes('text(verifiedEmail, 120)'));
 assert(!backend.slice(backend.indexOf('export async function submitLocalReview'),backend.indexOf('export async function reportLocalDirectory')).includes('text(input.email'));
});
check('Review self-assessment and duplicate prevention remain server side',()=>{
 assert(backend.includes("if (digest === entry.ownerEmailHash)"));
 assert(backend.includes("sha(id + ':' + digest)"));
 assert(backend.includes("status: 'pending'"));
});
check('Login is passwordless email-first, preserving existing admin providers',()=>{
 const config=JSON.parse(read('appdeploy.auth-login.json'));
 assert.deepEqual(config.methods,['email','google','apple','x']);
});
check('Showcase CTA goes to a real service-with-photos form',()=>{
 assert(app.includes("attribution.campaignId==='house-inclusion'"));
 assert(app.includes("openLocalDirectory('all',true)"));
 assert(ad.includes("isPhotoOffer?'PUBLICAR ES GRATIS'"));
 assert(ad.includes("Fotos de tus trabajos · Contacto directo"));
});
check('No fabricated conversion numbers or public stats',()=>{
 assert(!ad.includes('Más de 1.000'));
 assert(!ad.includes('Miles de clientes'));
});
check('Ad edits and client campaigns remain protected',()=>{
 assert(presentation.includes('previousDefaults'));
 assert(presentation.includes('const untouched'));
 assert(defaults.includes("if (paid.length)"));
 assert(ad.includes("presentHouseCreative"));
});
check('Ad typography and photos remain compact on mobile',()=>{
 const styles=read('src/advertising-surfaces.css');
 assert(styles.includes("background:linear-gradient(116deg"));
 assert(styles.includes(":has(.tcInlineHouseIcon .tcAdImage)"));
 assert(styles.includes("@media(max-width:780px)"));
});
check('Photo overlay keyboard, focus and reduced motion',()=>{
 const styles=read('src/local-directory.css');
 assert(styles.includes(".tcPhotoLightbox"));
 assert(styles.includes("max-height:calc(100dvh - 148px)"));
 assert(ui.includes("photoOrigin.current?.focus"));
});
console.log('MARKETPLACE_UX_QA '+checks+' contracts passed');
