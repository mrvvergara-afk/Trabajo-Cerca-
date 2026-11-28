import { api as catalogue } from './experience-client.mjs';
export { image } from './experience-client.mjs';

export const auth = { getUser: async () => ({ userId: 'qa-user' }) };
export const notifications = {
  configure: async () => {},
  onMessage(receiver) {
    window.tcDeliverPush = receiver;
    return () => { window.tcDeliverPush = undefined; };
  },
};

export const api = {
  ...catalogue,
  async get(path) {
    if (path === '/api/notifications/preferences') return { data: { active: true, communes: ['Angol'] } };
    return catalogue.get(path);
  },
  async post(path, body) {
    if (path !== '/api/notifications/test') return catalogue.post(path, body);
    window.tcTestId = body?.testId;
    if (window.tcTestMode === 'early') {
      window.tcDeliverPush({ data: { kind: 'notification_test', testId: body?.testId } });
    }
    if (window.tcTestMode === 'rejected') return { data: { sent: 0, failed: 1 } };
    return { data: { sent: 1, failed: 0 } };
  },
};
