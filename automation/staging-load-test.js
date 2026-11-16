// k6 read-only workload. NEVER run against the current public/laboratory app.
// Requires a separately isolated staging deployment with synthetic data and
// provider permission/capacity confirmation.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = (__ENV.STAGING_API_URL || '').replace(/\/$/, '');
if (!/^https:\/\//.test(BASE) ||
    BASE.includes('trabajo-cerca-laboratorio-3ojgro') ||
    BASE.includes('api-v2.appdeploy.ai/app/trabajo-cerca-laboratorio-3ojgro')) {
  throw new Error('STAGING_API_URL debe apuntar a un entorno aislado, nunca al laboratorio actual.');
}

export const options = {
  stages: [
    { duration: '2m', target: 25 },
    { duration: '2m', target: 50 },
    { duration: '3m', target: 100 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
    'checks{scenario:catalog}': ['rate>0.99'],
  },
};

export default function () {
  const chance = Math.random();
  if (chance < 0.70) {
    const res = http.get(BASE + '/api/listings?fresh=1', { tags: { scenario: 'catalog' } });
    check(res, {
      'HTTP 200': r => r.status === 200,
      'catálogo completo, no degradado': r => {
        try {
          const d = r.json();
          return Array.isArray(d.items) && d.degraded !== true &&
            d.feedRebuilding !== true && d.totalVerifiedJobOffers > 0;
        } catch { return false; }
      },
    }, { scenario:'catalog' });
  } else if (chance < 0.85) {
    const res = http.get(BASE + '/api/listings/identities');
    check(res, { 'identidades JSON sin degradación': r => {
      try { return r.status===200 && r.json().provisional===false; } catch { return false; }
    }});
  } else {
    const res = http.get(BASE + '/api/_healthcheck');
    check(res, { 'healthcheck operativo': r => r.status===200 });
  }
  sleep(1);
}
