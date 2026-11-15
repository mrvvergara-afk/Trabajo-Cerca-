const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');const ts=require('typescript');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('src/App.tsx'),dir=read('src/local-directory.tsx'),
 cdir=read('src/local-directory.css'),founder=read('src/ux-territorial-cleanup.css'),
 marketing=read('src/advertising-surfaces.css'),ads=read('src/advertising-surfaces.tsx');
let count=0;const ok=(name,fn)=>{fn();count++;console.log('PASS '+name)};
for(const file of ['src/App.tsx','src/local-directory.tsx','src/advertising-surfaces.tsx']){
 ok(file+' parses',()=>{
 const parsed=ts.createSourceFile(file,read(file),ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
 assert.equal(parsed.parseDiagnostics.length,0,parsed.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,'\\n')).join('\\n'));
 });
}
ok('Founder benefit contains truthful eligibility and clear application CTA',()=>{
 assert(app.includes("className='tcFounderCard'"));assert(app.includes('20 negocios elegibles'));
 assert(app.includes('30 días gratis'));assert(app.includes('14 días'));assert(app.includes('Sin cobros automáticos'));
 assert(app.includes('Inscribir mi negocio'));assert(founder.includes('.tcFounderCard .tcFounderCta'));
});
ok('Founder card uses local photo without deleting active backend promotion',()=>{
 assert(app.includes("src='/house-creatives/advertisers.svg'"));
 assert(app.includes("promotion.remaining"));assert(app.includes("setShowAdvertiser(true)"));
 assert(founder.includes('grid-template-columns:78px minmax(0,1fr)'));
});
ok('Rating modal is standalone with keyboard focus and owner explanation',()=>{
 assert(dir.includes("className='tcReviewBackdrop'"));
 assert(dir.includes("role='dialog' aria-modal='true'"));
 assert(dir.includes("reviewDialogRef.current?.focus"));
 assert(dir.includes("solo pueden calificar"));
});
ok('Five stars and 1-review-per-owner protection retained',()=>{
 assert(dir.includes('[1,2,3,4,5].map'));assert(dir.includes("aria-checked={rating===value}"));
 assert(dir.includes("!reviewer?.email"));assert(dir.includes("api.post('/api/local-directory/' + reviewId + '/reviews', {rating,hired})"));
 assert(!dir.includes("reviewId===entry.id && <form"));
});
ok('Rating validates own listing and does not allow anonymous review',()=>{
 assert(dir.includes("Esta ficha es tuya"));
 assert(dir.includes("auth.signInWithRedirect"));
 const backend=read('backend/local-directory.ts'),router=read('backend/index.ts');
 assert(backend.includes('verifiedEmail: string'));
 assert(router.includes("local-review',4,3600000,25), requireAuth()"));
});
ok('Rating dialog keeps text and star controls contained',()=>{
 assert(cdir.includes('.tcReviewBackdrop'));assert(cdir.includes('.tcReviewBody .tcDirectoryStars button'));
 assert(cdir.includes('max-height:calc(100dvh - 28px)'));
});
ok('Marketing house ads always use a large visual region',()=>{
 assert(marketing.includes('grid-template-areas:"copy photo" "cta photo"'));
 assert(marketing.includes('min-height:155px'));
 assert(marketing.includes("object-fit:cover!important"));
 assert(ads.includes('tcHouseFallbackThumb'));
});
ok('Marketing inside forms has fallback illustration',()=>{
 assert(ads.includes('tcFormHouseFallback'));assert(marketing.includes('.tcFormHouseFallback'));
});
ok('Paid campaign rendering unaffected',()=>{
 assert(app.includes("if(selection?.type==='COMMERCIAL')"));
 assert(ads.includes("commercial?'COMMERCIAL':'HOUSE_AD'"));
});
console.log('FOUNDERS_RATINGS_QA '+count+' contracts passed');
