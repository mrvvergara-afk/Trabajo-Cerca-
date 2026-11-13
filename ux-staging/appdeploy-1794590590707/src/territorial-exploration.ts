import { commercialPlaceMatches } from '../shared/commercial-policy';
import {PRIMARY_PLACES} from '../shared/territories';

// Cities outside the official 12-commune service area.
export const EXPLORATION_CITIES = ['Los Ángeles', 'Temuco'] as const;

type TerritorialOffer = { id:string; kind:string; workCommunes:string[];recruitmentCommunes?:string[] };
const CORE = new Set<string>(PRIMARY_PLACES);
const REACH = new Set<string>(EXPLORATION_CITIES);
export function officialWorkCommune(value:string){
  const clean=value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  if(clean==='mininco'||clean==='villa mininco')return 'Collipulli';
  if(clean==='coihue'||clean==='coigue')return 'Negrete';
  if(clean==='capitan pastene')return 'Lumaco';
  return PRIMARY_PLACES.find(place=>place.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()===clean)||value;
}
export function matchesTerritorialView(item:TerritorialOffer,place:string,_localPlaces:readonly string[]){
  // La ubicación laboral corresponde a la faena, no al área desde donde se recluta.
  const locations=item.workCommunes.map(officialWorkCommune);
  if(place!=='Todas')return locations.includes(officialWorkCommune(place));
  if(item.kind!=='job_offer')return true;
  return locations.some(town=>CORE.has(town));
}
// One distinct posting per scope; overlap is disclosed and NEVER added twice as an all-area total.
export function territorialScopeTotals(items:TerritorialOffer[]){
  const primary=new Set<string>(),reach=new Set<string>();
  for(const item of items){
    if(item.kind!=='job_offer')continue;
    if(item.workCommunes.some(city=>CORE.has(officialWorkCommune(city))))primary.add(item.id);
    if(item.workCommunes.some(city=>REACH.has(city)))reach.add(item.id);
  }
  const overlap=[...primary].filter(id=>reach.has(id)).length;
  return {primary:primary.size,reach:reach.size,overlap,reachOnly:reach.size-overlap,totalDistinct:primary.size+reach.size-overlap};
}
export function sponsorMatchesPlace(sponsor:{ communes:string[]; scope:string } | null, place:string) {
  if (!sponsor || !Array.isArray(sponsor.communes)) return false;
  return commercialPlaceMatches(sponsor.communes, place) && (sponsor.scope === 'regional' || sponsor.scope === 'exact');
}
export function safeSponsorUrl(value?:string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
