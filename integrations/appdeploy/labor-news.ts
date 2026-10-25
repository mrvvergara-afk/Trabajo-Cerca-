export type LaborNews = {
  id:string;
  title:string;
  summary:string;
  source:string;
  publishedOn:string;
  url:string;
  topic:'Empleo regional'|'Capacitación'|'Ferias laborales'|'Concursos públicos'|'Previsión y cesantía';
  region:'La Araucanía';
  reviewed:boolean;
};

// Small editorial selection. No scraping, AI, political/syndical feed or automatic
// publication. Original editorial date stays distinct from this review date.
export const LABOR_NEWS_REVIEWED_ON = '2026-10-21';
export const LABOR_NEWS:LaborNews[] = [{
  id:'tiempo21-araucania-empleo-2026-09-30',
  title:'La Araucanía: desocupación de 10,1% en junio–agosto de 2026',
  summary:'Tiempo21 informa los resultados regionales de la Encuesta Nacional de Empleo: la cantidad de personas ocupadas disminuyó 0,9% en doce meses.',
  source:'Tiempo21',
  publishedOn:'2026-09-30',
  url:'https://www.tiempo21.cl/desempleo-en-la-araucania-sube-a-101-y-ocupados-caen-09-en-un-ano/',
  topic:'Empleo regional',
  region:'La Araucanía',
  reviewed:true,
}];

export const LABOR_RESOURCES = [
  { title:'Ferias laborales y capacitación', source:'SENCE', url:'https://sence.gob.cl/personas/ferias-laborales-sence' },
  { title:'Desempleo y estadísticas regionales', source:'INE · La Araucanía', url:'https://regiones.ine.cl/araucania/inicio' },
  { title:'Concursos y empleos públicos', source:'Servicio Civil', url:'https://www.empleospublicos.cl/' },
  { title:'Formación y emprendimiento', source:'CORFO', url:'https://capacita.corfo.cl/' },
  { title:'Seguro de Cesantía', source:'AFC Chile', url:'https://www.afc.cl/' },
  { title:'AFP y pensiones', source:'Superintendencia de Pensiones', url:'https://www.spensiones.cl/' },
  { title:'Información al consumidor', source:'SERNAC', url:'https://www.sernac.cl/' },
];

export function visibleLaborNews(news:LaborNews[], now=Date.now()) {
  const today = new Date(now).toISOString().slice(0,10);
  return news.filter(item => {
    if (!item.reviewed || item.region !== 'La Araucanía' || !/^\d{4}-\d{2}-\d{2}$/.test(item.publishedOn)) return false;
    if (!['Empleo regional','Capacitación','Ferias laborales','Concursos públicos','Previsión y cesantía'].includes(item.topic)) return false;
    const date = Date.parse(item.publishedOn + 'T00:00:00Z');
    return Number.isFinite(date) && new Date(date).toISOString().slice(0,10) === item.publishedOn &&
      item.publishedOn <= today && Date.parse(today + 'T00:00:00Z') - date <= 45 * 86400000 &&
      /^https:\/\//.test(item.url) && Boolean(item.source && item.title && item.summary);
  }).sort((a,b) => b.publishedOn.localeCompare(a.publishedOn));
}
