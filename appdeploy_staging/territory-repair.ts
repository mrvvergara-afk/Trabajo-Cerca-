import { db } from '@appdeploy/sdk';

/**
 * One-time, allowlisted correction of five source-verified Chiletrabajos jobs.
 * Preserves the original record, publication date, source URL, status and ID.
 * Does not add, remove or reclassify any other offers.
 */
const REPAIR_RUN='correct-approved-worksites-20261118-v1';
type Target = {
  code:string;
  id:string;
  from:string;
  to:string;
  titlePhrase:string;
  companyPhrase:string;
  location:string;
};
const TARGETS:Target[]=[
  {code:'3930443',id:'free-bfefe2c24d6c6d3e2a7b892143258bd36345719c',
   from:'Temuco',to:'Angol',titlePhrase:'director',companyPhrase:'tierra de esperanza',location:'Angol'},
  {code:'3929011',id:'free-24733501af72fd876888075647fc8e48f5dc0531',
   from:'Temuco',to:'Victoria',titlePhrase:'ortodoncista',companyPhrase:'victoria',location:'Victoria'},
  {code:'3929311',id:'free-665cc0de1652d9b7d944064930c025d6a3e38dff',
   from:'Los Ángeles',to:'Negrete',titlePhrase:'cohigue',companyPhrase:'agrotop',location:'Cohigue, Negrete'},
  {code:'3926105',id:'free-9e173e643c73999fa7f6e52332a957d0834d0b45',
   from:'Angol',to:'Nacimiento',titlePhrase:'nacimiento',companyPhrase:'aljo',location:'Hospital de Nacimiento'},
  {code:'3887984',id:'free-3d3f9fa91ee8942da92bb88f07a7eaed8fef3043',
   from:'Angol',to:'Nacimiento',titlePhrase:'hospital de nacimiento',companyPhrase:'aljo',location:'Hospital de Nacimiento'},
];
const normal=(v:unknown)=>String(v||'').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();

export async function repairApprovedTerritoriesOnce() {
  const [completed]=await db.get<Record<string,unknown>>(
    'territory_repair_runs',[REPAIR_RUN],{consistent:true});
  if(completed?.status==='completed')
    return {status:'already_completed',repaired:Number(completed.repaired||0),skipped:Number(completed.skipped||0)};

  const inspected:Array<{code:string;state:string;reason?:string}>=[];
  let repaired=0,skipped=0;
  for(const target of TARGETS){
    const hash=target.id.slice(5);
    const table='radar_external_'+hash.slice(0,32);
    const [existing]=await db.get<Record<string,unknown>>(table,[target.id],{consistent:true});
    if(!existing){
      inspected.push({code:target.code,state:'skipped',reason:'source_record_missing'});
      skipped++;
      continue;
    }
    const work=Array.isArray(existing.workCommunes) ? existing.workCommunes : [];
    if(work.length===1 && work[0]===target.to){
      inspected.push({code:target.code,state:'already_correct'});
      continue;
    }
    const originalUrl=String(existing.url||'');
    const parsed=(()=>{try{return new URL(originalUrl)}catch{return null}})();
    const sourceId=parsed?.pathname.match(/(?:-|\/)(\d{5,12})\/?$/)?.[1];
    const sourceOk=parsed?.protocol==='https:' &&
      ['chiletrabajos.cl','www.chiletrabajos.cl'].includes(parsed.hostname) &&
      sourceId===target.code;
    const exactOldSite=work.length===1 && work[0]===target.from;
    const identityOk=String(existing.externalIdentity||'').startsWith(hash) &&
      /^free-[a-f0-9]{40}$/.test(target.id);
    const approved=existing.kind==='job_offer' && existing.active===true &&
      existing.verified===true && existing.review!==true;
    const titled=normal(existing.title).includes(target.titlePhrase) &&
      normal(existing.company).includes(target.companyPhrase);
    const deadline=existing.sourceValidThrough;
    const validDeadline=!deadline || (
      Number.isFinite(Date.parse(String(deadline))) &&
      Date.parse(String(deadline))>=Date.now()-86400000
    );
    const priorProof=existing.workLocationEvidence;
    const noContraryProof=!priorProof ||
      (typeof priorProof==='object' && priorProof!==null &&
       ['approved_chatgpt_original_worksite','audited_original_worksite']
        .includes(String((priorProof as {method?:string}).method||'')));
    if(!sourceOk || !exactOldSite || !identityOk || !approved ||
       !titled || !validDeadline || !noContraryProof){
      inspected.push({code:target.code,state:'skipped',
        reason:'source_or_record_guard_failed'});
      skipped++;
      continue;
    }
    const {id:_id,...fields}=existing;
    const stamp=new Date().toISOString();
    const corrected={
      ...fields,
      workCommunes:[target.to],
      workLocation:target.location,
      secondaryMarket:false,
      workLocationEvidence:{
        method:'audited_original_worksite',
        literal:target.location,
        sourceUrl:originalUrl,
        jobCode:target.code,
      },
      territoryCorrectionSource:'20261118_independent_3motor_audit',
      territoryCorrectionAt:stamp,
    };
    const auditId='worksite_'+target.code+'_20261118';
    const [done]=await db.transact([
      db.tx.update(table,[{id:target.id,record:corrected,
        ...(typeof existing.externalVerifiedAt==='string'
          ?{if:{externalVerifiedAt:existing.externalVerifiedAt}}:{})}]),
      db.tx.add('public_feed_changes',[{
        source:table,sourceId:target.id,queuedAt:stamp,
      }]),
      db.tx.add('territory_repair_audit',[{
        id:auditId,publicId:target.id,sourceTable:table,
        oldWorkCommunes:work,newWorkCommunes:[target.to],
        oldWorkLocation:existing.workLocation,
        sourceUrl:originalUrl,at:stamp,sourceJobCode:target.code,
        auditProof:'approved_3motor_reconciliation_and_original_title',
      }]),
    ]);
    if(!done)throw Error('territory_repair_write_not_confirmed_'+target.code);
    inspected.push({code:target.code,state:'corrected'});
    repaired++;
  }
  const stamp=new Date().toISOString();
  const [marked]=await db.tx.add('territory_repair_runs',[{
    id:REPAIR_RUN,status:'completed',checkedAt:stamp,repaired,skipped,
    inspected,originalVersion:'v99',
  }]);
  if(!marked){
    const [prior]=await db.get<Record<string,unknown>>('territory_repair_runs',
      [REPAIR_RUN],{consistent:true});
    if(prior?.status!=='completed')throw Error('territory_repair_checkpoint_missing');
  }
  console.warn('WORKSITE_SAFE_REPAIR '+JSON.stringify({
    status:'completed',repaired,skipped,inspected,
  }));
  return {status:'completed',repaired,skipped,inspected};
}
