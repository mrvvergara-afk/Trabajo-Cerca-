import { PRIMARY_PLACES } from './territories';
type Job={kind?:unknown;title?:unknown;workLocation?:unknown;workCommunes?:unknown;note?:unknown;url?:unknown;company?:unknown};
const normal=(x:unknown)=>String(x??'').normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const target=new Set(PRIMARY_PLACES.map(normal).concat(['mininco','coihue','coigue','capitan pastene']));
/** A source location contradiction requires review, not assignment to a local commune. */
export function contradictoryWorksite(item:Job):string|null {
  if(item.kind!=='job_offer'||!Array.isArray(item.workCommunes))return null;
  const communes=item.workCommunes.filter((v):v is string=>typeof v==='string').map(normal);
  if(!communes.some(city=>target.has(city)))return null;
  // Two verified Chiletrabajos source identities were incorrectly classified as Purén.
  const source=String(item.url||'').toLowerCase();
  const heading=normal(item.title);
  const employer=normal(item.company);
  const isPuren=communes.includes('puren');
  const knownId=/chiletrabajos\.cl/.test(source)&&
    /(?:[-/])(?:3933712|3935812)(?:[/?#]|$)/.test(source);
  const aif=employer.includes('consultores 2000')&&
    heading.includes('prevencionista de riesgos aif')&&heading.includes('chanaral');
  const recompany=employer.includes('recompany')&&
    heading.includes('lider prevencion de riesgo')&&
    heading.includes('sistema integrado de gestion');
  if(isPuren&&(knownId||aif||recompany))
    return 'original_chiletrabajos_source_not_in_puren';
  const rawTitle=String(item.title||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const site=' '+normal(item.workLocation)+' ';
  const note=normal(item.note),url=String(item.url||'').toLowerCase();
  for(const other of ['chanaral','santiago']){
    if(communes.includes(other))continue;
    const titlePlace=new RegExp('(?:[-–—/]|\\ben\\b|\\bpara\\b)\\s*'+other+'(?:\\s*\\([^)]*\\))?\\s*$').test(rawTitle);
    const locationField=site.includes(' '+other+' ');
    const notePlace=new RegExp('(?:lugar de trabajo|ubicacion laboral|faena en|trabajar en|trabajo en)\\s*(?:en\\s+)?'+other+'\\b').test(note);
    const originalSlug=new RegExp('[-/]'+other+'-\\d{5,12}(?:[/?#]|$)').test(url);
    if(titlePlace||locationField||notePlace||originalSlug)return 'worksite_disagrees_with_assigned_commune';
  }
  return null;
}
