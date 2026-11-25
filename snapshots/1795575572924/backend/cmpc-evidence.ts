import { createHash } from 'node:crypto';

export type CmpcEvidence = {
  schema:string; requisition_id:number; api_url:string; api_json:string; api_sha256:string;
  workplace_literal:string; employer_literal:string; application_label:string;
  reviewed_at:string; date_precision:'day'; deadline_policy:'start_of_local_date';
};
type Offer = { source_url:string; title:string; company:string; work_commune:string; work_site?:string;
  source_published_at:string; valid_through:string; application:string; verified_at:string;
  source_evidence?:{sha256:string; source_url:string; complete_document:boolean; text:string};
  cmpc_evidence?:CmpcEvidence };

// The public CMPC portal renders US month/day dates. Use the beginning of the
// stated closing date in Chile, rather than inventing a closing hour or an extra day.
export function cmpcDate(value:unknown):string {
  if (typeof value!=='string') throw new Error('Invalid CMPC date');
  const match=/^(\d{1,2})\/(\d{1,2})\/(20\d{2})$/.exec(value);
  if (!match) throw new Error('Invalid CMPC date');
  const [,month,day,year]=match, iso=year+'-'+month.padStart(2,'0')+'-'+day.padStart(2,'0');
  const instant=new Date(iso+'T12:00:00Z');
  if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0,10)!==iso) throw new Error('Invalid CMPC date');
  // Dates in October/January have UTC-03 under Chile's published timezone rules.
  const offset=new Intl.DateTimeFormat('en-US',{timeZone:'America/Santiago',timeZoneName:'longOffset'}).formatToParts(instant).find(part=>part.type==='timeZoneName')?.value.replace('GMT','');
  if (!offset || !/^[+-]\d{2}:\d{2}$/.test(offset)) throw new Error('CMPC timezone unavailable');
  return new Date(iso+'T00:00:00'+offset).toISOString();
}

const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const normalize=(value:string)=>value.normalize('NFKC').replace(/\s+/g,' ').trim();

export function validateCmpcEvidence(item:Offer, now=Date.now()) {
  const proof=item.cmpc_evidence, source=item.source_evidence;
  if (!proof || proof.schema!=='trabajo-cerca.cmpc-public-review.v1' || !Number.isSafeInteger(proof.requisition_id) || proof.requisition_id<1 ||
      proof.api_url!=='https://us.api.csod.com/rec-job-search/external/jobs' || typeof proof.api_json!=='string' || proof.api_json.length>18000 ||
      digest(proof.api_json)!==proof.api_sha256 || !source || source.source_url!==item.source_url || source.complete_document!==true ||
      typeof source.text!=='string' || source.text.length>18000 || digest(source.text)!==source.sha256 ||
      proof.reviewed_at!==item.verified_at || Date.parse(proof.reviewed_at)>now ||
      proof.date_precision!=='day' || proof.deadline_policy!=='start_of_local_date') throw new Error('Missing CMPC primary proof');
  const expected='https://cmpc.csod.com/ux/ats/careersite/4/home/requisition/'+proof.requisition_id+'?c=cmpc';
  if (item.source_url!==expected || item.application!==expected || item.company!=='CMPC' || proof.employer_literal!=='En CMPC' || proof.application_label!=='Apply Now') throw new Error('CMPC publisher or application mismatch');
  let response;
  try { response=JSON.parse(proof.api_json); } catch { throw new Error('Invalid CMPC response'); }
  const rows=response?.data?.requisitions;
  if (response?.status!=='Success' || !Array.isArray(rows) || rows.length!==1) throw new Error('CMPC response is not an individual requisition');
  const captured=Date.parse(response.timestamp);
  if (!Number.isFinite(captured) || captured>now || now-captured>3600000) throw new Error('Stale CMPC response');
  const row=rows[0], text=normalize(source.text), site=normalize(proof.workplace_literal);
  if (row.requisitionId!==proof.requisition_id || row.displayJobTitle!==item.title || /^(?:nombre del cargo|.*\bcopy\b)/i.test(item.title) ||
      !row.locations?.some((place:{city:string;country:string})=>place.country==='CL' && place.city===item.work_commune) ||
      cmpcDate(row.postingEffectiveDate)!==item.source_published_at || cmpcDate(row.postingExpirationDate)!==item.valid_through ||
      !text.includes(normalize(item.title)) || !text.includes('req'+proof.requisition_id) || !text.includes(item.work_commune) ||
      !text.includes('Posted on: '+row.postingEffectiveDate) || !text.includes(proof.employer_literal) || !text.includes(proof.application_label) ||
      !site || !text.includes(site) || item.work_site!==site || !/Ubicación:\s*/.test(site) ||
      /(?:postulaci[oó]n cerrada|job (?:closed|expired)|no longer available)/i.test(text)) throw new Error('CMPC role, date or workplace mismatch');
  return true;
}
