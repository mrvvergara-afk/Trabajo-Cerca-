import { api as catalogue } from './experience-client.mjs';
import { HOUSE_DEFAULTS } from '../../shared/house-ads';
export { auth, notifications, image } from './experience-client.mjs';

export const api = {
  ...catalogue,
  async get(path) {
    if (path === '/api/growth/institutional') {
      return { data: { manifest: window.tcAdvertisingFixture.manifest } };
    }
    if (path.startsWith('/api/growth/advertising?')) {
      const house = HOUSE_DEFAULTS.map(campaign => campaign.id === 'house-explore'
        ? { ...campaign, placements: ['search', 'listing', 'featured', 'form'], pages: [...campaign.pages, 'forms'] }
        : campaign);
      return { data: { house, commercial: window.tcAdvertisingFixture.commercial, complete: true } };
    }
    return catalogue.get(path);
  },
};
