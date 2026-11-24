import {publicFeedIdentity} from './public-source-adapters';

// Prior visible SDK records, 20-Oct 11:55:54 UTC. Projection metadata only.
const FIRST_KNOWN:Record<string,string>={
  "https://www.laborum.cl/empleos/oferta-1118452584.html": "2026-10-20T10:05:34.195Z",
  "https://www.laborum.cl/empleos/oferta-1118483484.html": "2026-10-20T10:05:34.195Z",
  "https://www.laborum.cl/empleos/oferta-1118469523.html": "2026-10-20T10:05:34.195Z",
  "https://www.chiletrabajos.cl/trabajo/3916595": "2026-10-20T07:05:28.386Z",
  "https://cmpc.csod.com/ux/ats/careersite/4/home/requisition/18859?c=cmpc": "2026-10-19T23:50:35.434Z",
  "https://mtraiguen.cl/municipalidad/bases-para-llamado-a-concurso-publico-de-3-cargos": "2026-10-18T02:05:32.661Z",
  "https://www.chiletrabajos.cl/trabajo/3902931": "2026-10-15T10:18:22.963Z",
  "https://www.bne.gob.cl/oferta/2026-112312": "2026-10-13T23:35:36.557Z",
  "https://www.bne.gob.cl/oferta/2026-109726": "2026-10-13T19:52:06.176Z",
  "https://www.chiletrabajos.cl/trabajo/3844114": "2026-10-12T19:05:30.327Z",
  "https://www.chiletrabajos.cl/trabajo/3911374": "2026-10-12T18:05:37.435Z",
  "https://www.chiletrabajos.cl/trabajo/3896966": "2026-10-10T15:05:35.616Z",
  "https://www.chiletrabajos.cl/trabajo/3889603": "2026-10-10T00:18:20.748Z",
  "https://www.chiletrabajos.cl/trabajo/3904934": "2026-10-08T15:05:34.766Z",
  "https://www.linkedin.com/jobs/view/4461259756": "2026-10-06T10:41:16.915Z",
  "https://www.chiletrabajos.cl/trabajo/3907378": "2026-10-06T10:22:29.439Z",
  "https://www.chiletrabajos.cl/trabajo/3903963": "2026-10-06T10:22:29.439Z",
  "https://www.chiletrabajos.cl/trabajo/3904472": "2026-10-05T09:10:32.315Z",
  "https://www.chiletrabajos.cl/trabajo/3899926": "2026-10-05T09:10:32.313Z",
  "https://www.chiletrabajos.cl/trabajo/3902639": "2026-10-05T09:10:32.311Z",
  "https://www.chiletrabajos.cl/trabajo/3895266": "2026-10-05T05:20:34.429Z",
  "https://cl.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-ingreso-inmediato-apoyo-auxiliar-bodega-armado-abc-angol-proyecto-del-03-octubre-al-30-nov-en-angol-7b9dda2687f57b4f61373e686dcf3405": "2026-10-03T15:05:21.290Z",
  "https://www.laborum.cl/empleos/oferta-1118449360.html": "2026-10-03T14:56:19.870Z",
  "https://www.chiletrabajos.cl/trabajo/3902541": "2026-10-03T14:56:19.870Z",
  "https://munilumaco.cl/index.php/sala-de-prensa/89-oferta-laboral-para-recolectores-y-supervisores": "2026-10-03T11:21:19.688Z",
  "https://www.chiletrabajos.cl/trabajo/3900906": "2026-10-03T11:19:23.401Z",
  "https://www.chiletrabajos.cl/trabajo/3894880": "2026-10-03T11:19:23.401Z",
  "https://www.chiletrabajos.cl/trabajo/3902218": "2026-10-03T11:19:18.801Z",
  "https://www.chiletrabajos.cl/trabajo/3907827": "2026-10-03T11:19:18.801Z",
  "https://www.chiletrabajos.cl/trabajo/3906496": "2026-10-02T17:00:31.317Z",
  "https://www.chiletrabajos.cl/trabajo/3904674": "2026-09-30T12:00:00-03:00",
  "https://munimulchen.cl/oferta-laboral-labores-agricolas-y-cuidado-de-parcela": "2026-09-30T12:00:00-03:00"
};

export function knownFirstPublication(item:Record<string,unknown>) {
  const key=typeof item.url==='string' ? publicFeedIdentity(item.url) : null;
  const prior=key ? FIRST_KNOWN[key] : undefined;
  const current=String(item.firstPublishedAt || item.createdAt || '');
  return prior && (!Number.isFinite(Date.parse(current)) || Date.parse(prior)<Date.parse(current)) ? prior : current;
}
