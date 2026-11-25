import {db} from '@appdeploy/sdk';
import {executiveEngineTelemetry} from './engine-telemetry';

/** Cron-only, low-frequency, aggregate telemetry receipt.
 * No PII, no import/publisher invocation, no modifications to job catalog.
 * A time-slot key makes retries idempotent.
 */
export async function captureEngineTelemetry(scheduledTime?:string){
 const result=await executiveEngineTelemetry();
 const ids=result.engines.map(x=>x.id);
 if(result.schemaVersion!==1||new Set(ids).size!==6||
   !['A','B','C','D','CHATGPT','GEMINI'].every(id=>ids.includes(id as typeof ids[number])))
  throw Error('telemetry_incomplete_engine_contract');
 const at=scheduledTime&&Number.isFinite(Date.parse(scheduledTime))
  ?new Date(scheduledTime).toISOString():new Date().toISOString();
 const id='slot_'+at.replace(/[^0-9]/g,'').slice(0,14);
 const item={
  id,at,recordedAt:new Date().toISOString(),schemaVersion:1,
  engines:result.engines.map(row=>({
   id:row.id,source:row.source,observedAt:row.observedAt,
   status:row.status,counts:row.counts
  })),
  historyPoints:result.history.length,
  historyComplete:result.historyComplete===true,
  historyQuality:result.historyQuality,
  missingOrFailed:result.missingOrFailed
 };
 const [written]=await db.tx.add('engine_telemetry_snapshots_v1',[item]);
 const [readback]=await db.get<Record<string,unknown>>(
  'engine_telemetry_snapshots_v1',[id],{consistent:true});
 if(!readback||readback.schemaVersion!==1||readback.at!==at)
  throw Error('telemetry_receipt_not_confirmed');
 console.warn('ENGINE_TELEMETRY_PROBE '+JSON.stringify({
  at,receipt:id,persisted:Boolean(written),engines:result.engines.map(row=>({
   id:row.id,status:row.status,at:row.observedAt,source:row.source,
   attempted:row.counts.attempted,processed:row.counts.processed,
   useful:row.counts.useful,blocked:row.counts.blocked
  })),historyPoints:result.history.length,historyComplete:result.historyComplete,
  legacyHistory:result.historyQuality.sources.map(s=>({
   table:s.table,scanned:s.scanned,complete:s.complete,error:s.readError
  }))
 }));
 return {statusCode:200};
}
