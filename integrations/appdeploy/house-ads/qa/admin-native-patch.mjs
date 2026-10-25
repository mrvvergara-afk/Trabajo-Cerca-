import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const base=JSON.parse(readFileSync('qa/admin-native-baseline.json','utf8'));
const hash=s=>createHash('sha256').update(s).digest('hex');
let code=base.index;
assert(!code.includes("from './radar-admin-verification'"));
code="import {processAdminReviewBatch,confirmAdminReviewPublications,isAdminVerificationSlot} from './radar-admin-verification';\n"+code;
let start=code.indexOf('async function processPendingOffers('),end=code.indexOf('\nasync function ',start+1);assert(start>=0&&end>start);
let part=code.slice(start,end);const active="    .filter(item => item.active && item.kind === 'job_offer')";assert(part.includes(active));part=part.replace(active,active+"\n    .filter(item => item.discoveredBy!=='admin-review-inbox-v1' || item.verified===true && item.review===false)");code=code.slice(0,start)+part+code.slice(end);
start=code.indexOf('export const v14VerificationHandler =');end=code.indexOf('\n};',start)+3;part=code.slice(start,end);assert(part.includes('const result=providerSlot ? await processPendingOffers(8) : undefined;'));
part=part.replace('  const ingestion=await pullRadarBatch(externalOfferRecord);','  const ingestion=await pullRadarBatch(externalOfferRecord);\n  const administrative=isAdminVerificationSlot(event) ? await processAdminReviewBatch({scheduledTime:event!.scheduledTime,project:projectFeedListing}) : undefined;').replace('  const receipts=await confirmRadarPublications();','  const receipts=await confirmRadarPublications();\n  const adminPublications=isAdminVerificationSlot(event) ? await confirmAdminReviewPublications() : undefined;').replace('ingestion,receipts,','ingestion,receipts,administrative,adminPublications,');code=code.slice(0,start)+part+code.slice(end);
const route="'GET /api/admin/radar-review': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async () => json(await listReview())]";assert(code.includes(route));code=code.replace(route,"'GET /api/admin/radar-review': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async ctx => {const response=json(await listReview(ctx.query.cursor));response.headers={...response.headers,'Cache-Control':'no-store, private','Vary':'Authorization'};return response; }]");
// This is a scoped patch for the actual native version. It does not replace
// native PILOT, secrets, policies, frontend layout or any cron configuration.
code=code.replace("'primarySourceEvidence','documentUnitProof']","'primarySourceEvidence','documentUnitProof','adminVerificationEvidence','adminVerificationAttempt']");
assert(code.includes("'Quilaco'"));assert(code.includes('const providerSlot=isOriginalVerificationSlot(event)'));
let backup=base.backup;for(const table of ['radar_review_inbox','radar_admin_verification_control','radar_admin_verification_queue'])if(!backup.includes("'"+table+"'"))backup=backup.replace('export const BACKUP_TABLES = [',"export const BACKUP_TABLES = [\n  '"+table+"',");
const files=[{path:'backend/index.ts',content:code},{path:'backend/admin-backup.ts',content:backup},...['backend/radar-review-inbox.ts','backend/radar-review-check.ts','backend/radar-review-queue.ts','backend/radar-admin-verification.ts','src/radar-review-inbox.tsx','src/radar-review-inbox.css'].map(path=>({path,content:readFileSync(path,'utf8')}))];
mkdirSync('qa-output/admin-publication',{recursive:true});
writeFileSync('qa-output/admin-publication/appdeploy-scoped-patch.json',JSON.stringify({app_id:'trabajo-cerca-laboratorio-3ojgro',expected_snapshot:base.snapshot,originalIndexSha256:hash(base.index),indexSha256:hash(code),files,cronChanges:0,paidProviderChanges:0,productionDataWrites:0,deployed:false,requiresFreshSnapshotComparison:true},null,2));
writeFileSync('qa-output/admin-publication/native-index.ts',code);
console.log('NATIVE_ADMIN_PATCH '+JSON.stringify({baseSnapshot:base.snapshot,files:files.map(x=>x.path),sourceSha256:hash(base.index),patchedSha256:hash(code),cronChanges:0,deployed:false}));
