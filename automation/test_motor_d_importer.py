"""Run generated OCR batches through the actual deployed TS parser and bridge offline."""
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from test_motor_d_review_promotion import approved, prepare, TODAY
from motor_d_express import produce

ROOT = Path(__file__).resolve().parent.parent

@unittest.skipUnless(shutil.which('node'), 'Node 24 required for deployed TypeScript contract')
class ImporterContractTests(unittest.TestCase):
    def test_generated_batch_is_accepted_idempotent_and_publication_requires_visibility(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            report, _ = prepare({'schema':'trabajo-cerca.motor-d-review.v1','items':[approved()]})
            produce(report, root/'ready', TODAY)
            fixture = ROOT/'automation/fixtures/deployed-importer'
            # Only transport/database imports are replaced. Parsing, deduplication,
            # admission and publication logic run unchanged in Node's TS runtime.
            direct = (fixture/'chatgpt-direct-import.ts').read_text().replace("'@appdeploy/sdk'", "'./sdk.ts'").replace("'./public-feed'", "'./feed.ts'").replace("'./public-source-adapters'", "'./adapters.ts'")
            bridge = (ROOT/'appdeploy_staging/motor-d-auto-import.ts').read_text().replace("'@appdeploy/sdk'", "'./sdk.ts'").replace("'./public-feed'", "'./feed.ts'").replace("'./public-source-adapters'", "'./adapters.ts'").replace("'./chatgpt-direct-import'", "'./direct.ts'")
            (root/'direct.ts').write_text(direct)
            (root/'bridge.ts').write_text(bridge)
            shutil.copyfile(fixture/'public-source-adapters.ts', root/'adapters.ts')
            (root/'package.json').write_text('{"type":"module"}')
            (root/'sdk.ts').write_text('''
export const tables=new Map();
const table=(name)=>{if(!tables.has(name))tables.set(name,new Map());return tables.get(name);};
export const db={get:async(name,ids)=>ids.map(id=>table(name).get(id)||null),
 list:async(name)=>({items:[...table(name).values()]}),tx:{
 add:async(name,rows)=>rows.map(row=>{if(table(name).has(row.id))return null;table(name).set(row.id,row);return row.id;}),
 update:async(name,rows)=>rows.map(row=>{table(name).set(row.id,{...row.record,id:row.id});return true;})}};
export const secrets={listSecretNames:async()=>['MOTOR_C_GITHUB_READ_TOKEN'],readSecret:async()=> 'offline-only'};
export const json=(body)=>({statusCode:200,body:JSON.stringify(body)});
export const error=(message,statusCode)=>({statusCode,body:JSON.stringify({message})});
''')
            (root/'feed.ts').write_text('''
export let visible=[];
export let degraded=false;
export const show=(items)=>{visible=items;};
export const degrade=(value)=>{degraded=value;};
export const readPublicFeedPage=async()=>({items:visible,totalJobOffers:visible.length,degraded});
export const registerPublicFeedChange=async()=>{};
''')
            (root/'run.ts').write_text('''
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {db,tables} from './sdk.ts';
import {show,degrade} from './feed.ts';
import {directChatGPTImport} from './direct.ts';
import {motorDAutoImportHandler,confirmMotorDPublications} from './bridge.ts';
// All time-dependent tests are fixed to the evidence day.
Date.now=()=>Date.parse('2026-11-08T15:00:00Z');
globalThis.fetch=async(url)=>{
 if(url==='https://munimulchen.cl/omil/oferta')return new Response('complete synthetic evidence');
 assert.ok(url.startsWith('https://api.github.com/'));
 const path=new URL(url).pathname.split('/contents/')[1].replace('automation/motor_d_ready/','');
 const bytes=fs.readFileSync(new URL('./ready/'+path,import.meta.url));
 return {ok:true,status:200,json:async()=>({encoding:'base64',content:bytes.toString('base64'),size:bytes.length,sha:'offline-fixture'})};
};
const result=JSON.parse((await motorDAutoImportHandler()).body);
assert.equal(result.state,'imported_waiting_for_feed');
assert.equal(result.accepted,1);
assert.equal(tables.get('radar_jobs').size,1);
assert.equal((await confirmMotorDPublications()).publishedBatches,0);
degrade(true);
assert.equal((await confirmMotorDPublications()).status,'feed_unavailable');
degrade(false);
show([...tables.get('radar_jobs').values()]);
assert.equal((await confirmMotorDPublications()).publishedBatches,1);
const noHeartbeat=JSON.parse((await motorDAutoImportHandler()).body);
assert.equal(noHeartbeat.state,'no_unprocessed_batches_producer_unverified');
assert.equal(noHeartbeat.producerExecutionUnverified,true);
assert.equal(tables.get('radar_jobs').size,1);
// Isolated real-parser contract: a verified recent producer heartbeat
// proves the scan executed, not that any new offer was published.
fs.mkdirSync(new URL('./ready/automation/motor_d_discovery/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('./ready/automation/motor_d_discovery/producer_heartbeat.json',import.meta.url),JSON.stringify({
 schema_version:1,producer:'motor_d_territorial',
 scan_completed_at:'2026-11-08T13:00:00Z',
 communes_expected:['Angol','Collipulli','Ercilla','Lumaco','Los Sauces','Purén','Renaico','Traiguén','Victoria','Mulchén','Negrete','Nacimiento'],
 missing_communes:[],
 sources_total:12,sources_accessible:12,source_report_sha256:'a'.repeat(64)
}));
const withHeartbeat=JSON.parse((await motorDAutoImportHandler()).body);
assert.equal(withHeartbeat.state,'no_unprocessed_batches_producer_confirmed');
assert.equal(withHeartbeat.producerExecutionUnverified,false);
assert.equal(tables.get('radar_jobs').size,1);
// A heartbeat older than the four-daily-run tolerance cannot assert a current scan.
const heartbeatPath=new URL('./ready/automation/motor_d_discovery/producer_heartbeat.json',import.meta.url);
const recent=JSON.parse(fs.readFileSync(heartbeatPath,'utf8'));
fs.writeFileSync(heartbeatPath,JSON.stringify({...recent,scan_completed_at:'2026-11-07T04:00:00Z'}));
const stale=JSON.parse((await motorDAutoImportHandler()).body);
assert.equal(stale.producerExecutionUnverified,true);
assert.equal(stale.state,'no_unprocessed_batches_producer_unverified');
fs.writeFileSync(heartbeatPath,JSON.stringify(recent));
assert.equal(tables.get('radar_jobs').size,1);
// Changed bytes block import before any database write.
tables.get('motor_d_import_receipts').clear();
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url)=>url==='https://munimulchen.cl/omil/oferta' ? new Response('changed evidence') : originalFetch(url);
assert.equal(JSON.parse((await motorDAutoImportHandler()).body).state,'ocr_document_changed_or_unavailable');
assert.equal(tables.get('radar_jobs').size,1);
globalThis.fetch=originalFetch;
// Expired authorization must not create another job or claim publication.
const manifest=JSON.parse(fs.readFileSync(new URL('./ready/index.json',import.meta.url),'utf8'));
const entry=manifest.batches[0];
const path=new URL('./ready/'+entry.file,import.meta.url);
const batch=JSON.parse(fs.readFileSync(path,'utf8'));
batch.offers[0].ocr_revalidate_after='2026-11-08T12:00:00Z';
fs.writeFileSync(path,JSON.stringify(batch));
tables.get('motor_d_import_receipts').clear();
const expired=JSON.parse((await motorDAutoImportHandler()).body);
assert.equal(expired.accepted,0);
assert.equal(tables.get('radar_jobs').size,1);
assert.equal([...tables.get('motor_d_import_receipts').values()][0].status,'processed_without_publication');
assert.equal((await confirmMotorDPublications()).publishedBatches,0);
// Regression: deployed parser rejects an explicit workplace conflicting with its title.
const invalid={...batch.offers[0],cargo:'Psicólogo Comuna Ercilla',comunas:['Angol']};
assert.equal((await directChatGPTImport({offers:[invalid],commit:false})).statusCode,400);
console.log('OCR_IMPORTER_CONTRACT_OK: accepted, idempotent, expired blocked, visible confirmed');
''')
            run = subprocess.run(['node',str(root/'run.ts')], text=True, capture_output=True)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            self.assertIn('OCR_IMPORTER_CONTRACT_OK', run.stdout)
