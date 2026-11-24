const territory=/(?:^|-)(angol|collipulli|mininco|ercilla|lumaco|capitan-pastene|los-sauces|puren|renaico|tijeral|huelehueico|traiguen|victoria|mulchen|negrete|coihue|coigue|nacimiento)(?:-|$)/;
const complementary=/(?:^|-)(temuco|los-angeles)(?:-|$)/;

export function workingLinkRank(url:string):number {
  const path=new URL(url).pathname.toLowerCase();
  if(/(?:nueva-victoria|victoria-de-santiago|la-victoria)(?:-|$)/.test(path))return 2;
  if(territory.test(path))return 0;
  if(complementary.test(path))return 1;
  return 2;
}

export function workingLinkKind(url:string):'sitemap'|'landing'|'detail'|null {
  const path=new URL(url).pathname;
  if(/^\/sitemap[a-z0-9_/-]*\.xml$/i.test(path))return 'sitemap';
  if(/^\/trabajo\/\d{5,}(?:-[a-z0-9-]+)?\/?$/i.test(path))return 'detail';
  if(/^\/trabajo-[a-z0-9-]+\/?$/i.test(path) && workingLinkRank(url)<2)return 'landing';
  return null;
}
