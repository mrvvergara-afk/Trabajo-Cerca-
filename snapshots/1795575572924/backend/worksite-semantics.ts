/**
 * Parse a workplace description without mistaking employer names for geographic
 * evidence. This module deliberately does NOT infer a commune from the job title
 * or the company field.
 *
 * "Forestal Mininco" is a CMPC business; "Villa Mininco" is a locality in
 * Collipulli. "Bosques Arauco", "Paneles Arauco" and "Remanufactura Arauco"
 * are corporate names, not evidence that the job is in Arauco commune.
 */
export function normalizeWorksiteText(value:unknown):string {
  return String(value ?? '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9 ]/g,' ').replace(/ +/g,' ').trim();
}

export function workplaceWithoutEmployerNames(value:unknown):string {
  return normalizeWorksiteText(value)
    .replace(/\b(?:cmpc\s+)?forestal\s+mininco(?:\s+(?:spa|sa))?\b/g,' ')
    .replace(/\b(?:bosques?|paneles|remanufactura|maderas|celulosa)\s+arauco(?:\s+(?:spa|sa))?\b/g,' ')
    .replace(/\barauco\s+(?:spa|sa)\b/g,' ')
    .replace(/ +/g,' ').trim();
}

const PLACES:Record<string,string[]>={
  collipulli:['collipulli','mininco','villa mininco'],
  negrete:['negrete','coihue','coigue','cohigue'],
  lumaco:['lumaco','capitan pastene'],
};

/**
 * Requires an explicit location field, not a job title or employer name.
 * Ambiguous descriptions without a real worksite must be sent for review.
 */
export function worksiteMentionsCommune(worksite:unknown,commune:string):boolean {
  const text=' '+workplaceWithoutEmployerNames(worksite)+' ';
  const place=normalizeWorksiteText(commune);
  const aliases=PLACES[place] || [place];
  for(const alias of aliases){
    if(!text.includes(' '+alias+' '))continue;
    if(alias==='victoria' &&
       (/\bnueva victoria\b/.test(text)||/\bvictoria s secret\b/.test(text)))
      continue;
    return true;
  }
  return false;
}
