// Executes the repository's consumer/feed against a local SQLite SDK adapter.
// Does not import the AppDeploy SDK, call fetch, sign a batch, or deploy anything.
import { DatabaseSync } from 'node:sqlite';
import { createHash, createPublicKey, randomUUID, verify } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';

export function localSdk(path) {
  const connection=new DatabaseSync(path);
  connection.exec('CREATE TABLE IF NOT EXISTS records(table_name TEXT,id TEXT,record TEXT,PRIMARY KEY(table_name,id))');
  const select=connection.prepare('SELECT record FROM records WHERE table_name=? AND id=?');
  const db={
    async list(table,options={}) {
      const start=Number(options.nextToken || 0),limit=options.limit || 50;
      const rows=connection.prepare('SELECT id,record FROM records WHERE table_name=? ORDER BY rowid LIMIT ? OFFSET ?').all(table,limit+1,start);
      return {items:rows.slice(0,limit).map(r=>({...JSON.parse(r.record),id:r.id})),nextToken:rows.length>limit?String(start+limit):undefined};
    },
    async get(table,ids) {return ids.map(id=>{const row=select.get(table,id);return row?{...JSON.parse(row.record),id}:null;});},
    async add(table,records) {return records.map(record=>{
      const id=record.id || randomUUID();
      const written=connection.prepare('INSERT OR IGNORE INTO records VALUES(?,?,?)').run(table,id,JSON.stringify(record));
      return written.changes?id:null;
    });},
    async update(table,records) {return records.map(({id,record})=>Boolean(connection.prepare('UPDATE records SET record=? WHERE table_name=? AND id=?').run(JSON.stringify(record),table,id).changes));},
    async delete(table,ids) {
      if (table==='radar_jobs' || /^radar_external_[a-f0-9]{32}$/.test(table)) throw new Error('Proof refuses to delete historical offers');
      return ids.map(id=>Boolean(connection.prepare('DELETE FROM records WHERE table_name=? AND id=?').run(table,id).changes));
    },
  };
  return {db,connection,close:()=>connection.close()};
}

export function runtime(db,now) {
  const clock={now};
  class Clock extends Date {
    constructor(...args) {super(...(args.length?args:[clock.now]));}
    static now() {return clock.now;}
  }
  const ctx=vm.createContext({db,URL,Buffer,Intl,Date:Clock,createHash,createPublicKey,verify,AbortSignal,
    fetch:()=>{throw new Error('Network is disabled in the isolated consumer');}});
  for (const file of ['public-source-adapters.ts','public-feed.ts','offer-retention.ts','radar-ingestion.ts']) {
    const path=new URL('../integrations/appdeploy/'+file,import.meta.url);
    const source=stripTypeScriptTypes(readFileSync(path,'utf8'),{mode:'strip'}).replace(/^import .*;$/gm,'').replace(/^export /gm,'');
    vm.runInContext(source,ctx);
  }
  const controller=readFileSync(new URL('../tests/fixtures/appdeploy-v99-document-controller.ts',import.meta.url),'utf8');
  vm.runInContext(stripTypeScriptTypes(controller,{mode:'strip'}),ctx);
  const mapper=item=>ctx.externalOfferRecord(item);
  const projector={project:item=>ctx.projectFeedListing(item),refreshAt:item=>ctx.feedRefreshAt(item)};
  async function build() {
    for (let i=0;i<40;i++) {
      await ctx.advancePublicFeed(projector);
      if (await ctx.currentPublicFeedManifest() && !(await db.list('public_feed_changes',{limit:1})).items.length) return;
    }
    throw new Error('Isolated feed did not finish');
  }
  async function feed() {
    let cursor,items=[];
    do {const page=await ctx.readPublicFeedPage(cursor);items.push(...page.items);cursor=page.nextCursor;} while (cursor);
    return items;
  }
  return {ctx,clock,mapper,projector,build,feed};
}

export async function proveConsumer(records,output,now=Date.now()) {
  assert.equal(records.length,3,'The real reference contains three reviewed jobs');
  mkdirSync(output,{recursive:false});
  const path=resolve(output,'consumer.sqlite3');let sdk=localSdk(path);let app=runtime(sdk.db,now);
  const legacy={kind:'job_offer',title:'Control histórico local (dato sintético)',company:'Control local',url:'https://www.chiletrabajos.cl/trabajo/control-historico',
    active:true,verified:true,review:false,workCommunes:['Traiguén'],sourcePublishedAt:new Date(now-10*86400000).toISOString(),
    expiresAt:new Date(now+30*86400000).toISOString(),createdAt:new Date(now-10*86400000).toISOString()};
  const [legacyId]=await sdk.db.add('radar_jobs',[legacy]);
  const batch={records,run_id:'0'};
  const digest=createHash('sha256').update(JSON.stringify(records)).digest('hex');
  const stored=await app.ctx.storeVerifiedBatch(batch,digest,app.mapper,now);
  assert.equal(stored.stored,3);assert.equal(stored.published,0);
  await app.build();const first=await app.ctx.confirmRadarPublications();assert.equal(first.published,3);
  const firstStatus=await app.ctx.externalRadarStatus();
  const firstIds=Array.from(firstStatus.receipts,r=>r.publishedId).sort();assert.equal(new Set(firstIds).size,3);
  const visible=await app.feed();assert.equal(visible.filter(item=>item.documentUnitKey).length,3);
  const originalHistory=(await sdk.db.get('radar_jobs',[legacyId]))[0];
  sdk.close();sdk=localSdk(path);app=runtime(sdk.db,now);
  assert.equal((await app.feed()).filter(item=>item.documentUnitKey).length,3);
  await app.ctx.storeVerifiedBatch(batch,digest,app.mapper,now);await app.build();
  assert.equal((await app.ctx.confirmRadarPublications()).published,3);
  const replayStatus=await app.ctx.externalRadarStatus();
  assert.deepEqual(Array.from(replayStatus.receipts,r=>r.publishedId).sort(),firstIds);
  assert.deepEqual((await sdk.db.get('radar_jobs',[legacyId]))[0],originalHistory);
  const storedUnits=sdk.connection.prepare("SELECT count(*) AS total FROM records WHERE table_name GLOB 'radar_external_*' AND length(table_name)=47").get().total;
  assert.equal(storedUnits,3);
  const deadline=Math.max(...records.map(item=>Date.parse(item.valid_through)));
  app.clock.now=deadline+1;await app.build();
  assert.equal((await app.feed()).filter(item=>item.documentUnitKey).length,0);
  assert.equal(sdk.connection.prepare("SELECT count(*) AS total FROM records WHERE table_name GLOB 'radar_external_*' AND length(table_name)=47").get().total,3);
  assert.deepEqual((await sdk.db.get('radar_jobs',[legacyId]))[0],originalHistory);
  const report={schema:'trabajo-cerca.isolated-document-consumer-proof.v1',checked_at:new Date(now).toISOString(),
    real_reference_roles:records.map(r=>r.title),local_stored:3,local_feed_confirmed:3,local_ids:firstIds,
    restart_preserved:3,replay_preserved_ids:true,duplicates:0,legacy_control_preserved:true,
    expired_visible:0,expired_source_records_retained:3,visible_snapshot:visible.filter(r=>r.documentUnitKey),
    storage_adapter:'Local SQLite implementing the SDK interface; no AppDeploy connection',
    consumer_files:['public-source-adapters.ts','public-feed.ts','offer-retention.ts','radar-ingestion.ts'],
    controller_policy_snapshot:'1791924889565',verification_freshness_hours:24,
    reviewed_evidence_required:true,github_signature_transport_tested:false,production_modified:false,
    paid_provider_calls:0,production_published:0};
  writeFileSync(resolve(output,'consumer-proof.json'),JSON.stringify(report,null,2)+'\n');sdk.close();return report;
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1];
  if (!args.includes('--queue') || !args.includes('--output')) throw new Error('Use --queue FILE --output NEW_FOLDER');
  const queue=JSON.parse(readFileSync(option('--queue'),'utf8'));
  const report=await proveConsumer(queue.records,option('--output'));
  console.log(JSON.stringify({...report,visible_snapshot:undefined}));
}
