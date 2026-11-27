export { auth, image } from './client.mjs';
export const notifications = { configure: async () => {}, onMessage: () => () => {} };

function job(id, workCommunes, verified = true) {
  return {
    id, kind: 'job_offer', origin: 'radar', title: 'Oferta de prueba ' + id,
    company: 'Empresa de prueba', workLocation: workCommunes[0], workCommunes,
    recruitmentZones: [], recruitmentCommunes: [], area: 'Operaciones',
    status: 'Abierta', date: '2026-11-26', sourcePublishedAt: '2026-11-26',
    source: 'Chiletrabajos', sourceDomain: 'chiletrabajos.cl',
    url: 'https://www.chiletrabajos.cl/trabajo/' + id, note: '', tags: [],
    visual: 'field', icon: 'work', review: !verified, verified, active: true,
    createdAt: '2026-11-26T15:00:00Z',
  };
}

const items = [
  job('qa-dos-comunas', ['Angol', 'Mininco']),
  job('qa-renaico', ['Renaico']),
  job('qa-temuco', ['Temuco']),
  job('qa-provisional', ['Angol'], false),
];

export const api = {
  async get(path) {
    if (path.startsWith('/api/listings?')) {
      return {
        data: {
          items, feedState: 'fresh', totalItems: 4, totalJobOffers: 4,
          totalVerifiedJobOffers: 3, totalProvisionalJobOffers: 1,
        },
      };
    }
    return { data: {} };
  },
  async post() { return { data: {} }; },
};
