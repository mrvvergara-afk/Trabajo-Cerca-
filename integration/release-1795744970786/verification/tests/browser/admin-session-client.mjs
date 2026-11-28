import { api as dashboard, notifications, image } from './client.mjs';
import { api as backup } from './backup-client.mjs';
export { notifications, image };

const state = () => window.tcAdminFixture;
const denial = status => Object.assign(Error('Simulated response'), { response: { status } });
export const auth = {
  getUser: async () => state().session === 'signedOut' ? null : { userId: 'qa-admin' },
  signOut: async () => { state().session = 'signedOut'; },
};
export const api = {
  ...dashboard,
  post(path, body) {
    return path === '/api/admin/backup/page' ? backup.post(path, body) : dashboard.post(path, body);
  },
  async get(path) {
    window.tcAdminReads ??= [];
    window.tcAdminReads.push(path);
    if (path === '/api/admin/session') {
      const { session, delaySession } = state();
      if (delaySession) {
        await new Promise(resolve => { window.tcReleaseAdminCheck = resolve; });
      }
      const status = { expired: 401, forbidden: 403, unavailable: 503, signedOut: 401 }[session];
      if (status) throw denial(status);
      return { data: { administrator: true } };
    }
    if (path === '/api/admin/ops-telemetry' && state().telemetryDenial) {
      throw Object.assign(Error('Simulated telemetry response'), { status: state().telemetryDenial });
    }
    if (path === '/api/admin/local-directory') return { data: { entries: [], reviews: [], reports: [] } };
    if (path === '/api/admin/radar-review') return { data: { schema: 'trabajo-cerca.review-inbox.v1', items: [], total: 0 } };
    if (path === '/api/admin/internal-offer-reconciliation') return { data: {
      items: [], counts: {}, totalInternalJobRecords: 1, publicFeedEntries: 2, inventoryComplete: true, publicComplete: true,
      checkedAt: '2026-11-28T13:00:00Z',
    } };
    if (path === '/api/admin/marketing/house') return { data: { campaigns: [], stats: [] } };
    if (path === '/api/admin/marketing/commercial') return { data: { plans: [] } };
    if (path.startsWith('/api/listings')) return { data: {
      totalVerifiedJobOffers: 2, totalItems: 2, items: [{ kind: 'job_offer', verified: true }],
    } };
    if (path === '/api/admin/territorial-coverage') return { data: {
      readOnly: true, checkedAt: '2026-11-28T13:00:00Z', feedComplete: true, sourceAuditComplete: false,
      sources: [{ id: 'Municipalidad de Angol', status: 'ok', candidates: 0 }],
      communes: [{ city: 'Angol', publicJobs: 2, sourceConfigured: 4, sourceChecked: 3, sourceWithFindings: 1,
        sourceFailed: 1, internalPending: 0, unpublishedEligible: 0 }],
    } };
    if (path === '/api/ops/summary') {
      return { data: {
        jobs: { publicVisible: 2, active: 2, verified: 2, publicPending: 0, direct: 0 },
        radar: { pendingCandidates: 1 }, growth: { advertiserLeads: 0, activeCampaigns: 0 },
        privacy: { note: '' }, updatedAt: new Date().toISOString(),
      } };
    }
    return dashboard.get(path);
  },
};
