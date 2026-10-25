import {COMPLEMENTARY_PLACES} from '../shared/territories';
export const EXPLORATION_CITIES = COMPLEMENTARY_PLACES;

type TerritorialOffer = { id:string; kind:string; workCommunes:string[] };

export function matchesTerritorialView(item:TerritorialOffer, place:string, localPlaces:readonly string[]) {
  if (place !== 'Todas') return item.workCommunes.includes(place);
  if (item.kind !== 'job_offer') return true;
  return item.workCommunes.some(town => localPlaces.includes(town) &&
    !(EXPLORATION_CITIES as readonly string[]).includes(town));
}

export function sponsorMatchesPlace(sponsor:{ communes:string[]; scope:string } | null, place:string) {
  if (!sponsor || !Array.isArray(sponsor.communes)) return false;
  if (sponsor.communes.includes('Todas')) return sponsor.scope === 'regional' || sponsor.communes.includes(place);
  return place !== 'Todas' && sponsor.communes.includes(place) && sponsor.scope === 'exact';
}

export function safeSponsorUrl(value?:string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
