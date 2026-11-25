/** Presentational place label only.
 * Never alters canonical workLocation, workCommunes, geographic filtering,
 * publication metadata, or the detail drawer.
 *
 * A source may put a company's description in workLocation. Job badges must
 * show recognised places instead, without inventing a worksite.
 */
const KNOWN_PLACES = [
  'Angol','Collipulli','Ercilla','Lumaco','Los Sauces','Purén',
  'Renaico','Traiguén','Victoria','Mulchén','Negrete','Nacimiento',
] as const;
const ALIASES: ReadonlyArray<{detect:string;label:string;parent?:string}> = [
  {detect:'nueva imperial',label:'Imperial'},
  {detect:'mininco',label:'Mininco',parent:'Collipulli'},
  {detect:'coihue',label:'Coihue',parent:'Negrete'},
  {detect:'coigue',label:'Coihue',parent:'Negrete'},
  {detect:'capitan pastene',label:'Capitán Pastene',parent:'Lumaco'},
];
function clean(value:string){
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-CL');
}
function hasPlace(source:string,place:string){
  const escaped=clean(place).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp('(^|[^a-z])'+escaped+'(?=$|[^a-z])','i').test(source);
}
export function compactWorkplaceLabel(
  workLocation:string|undefined,
  workCommunes:readonly string[]=[],
):string {
  const source=clean(workLocation||'');
  const found:string[]=[];
  const add=(value:string)=>{if(!found.includes(value))found.push(value);};
  const aliased=ALIASES.filter(alias=>hasPlace(source,alias.detect));
  for(const town of KNOWN_PLACES) {
    if(hasPlace(source,town)&&!aliased.some(alias=>alias.parent===town))add(town);
  }
  for(const alias of aliased)add(alias.label);
  // Prioritise the local worksite in a mixed local/extraterritorial posting.
  const locals=found.filter(label=>label!=='Imperial');
  const external=found.filter(label=>label==='Imperial');
  const result=[...locals,...external];
  if(result.length){
    return result.length>2 ? result.length+' localidades' : result.join(' / ');
  }
  // A vetted canonical commune is safer than guessing from employer prose.
  for(const town of workCommunes){
    const normalized=clean(town);
    const alias=ALIASES.find(entry=>clean(entry.label)===normalized||entry.detect===normalized);
    if(alias)add(alias.label);
    else {
      const matched=KNOWN_PLACES.find(entry=>clean(entry)===normalized);
      if(matched)add(matched);
    }
  }
  if(found.length===0)return 'Lugar por confirmar';
  if(found.length>2)return found.length+' localidades';
  return found.join(' / ');
}
