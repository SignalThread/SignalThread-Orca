import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 300,
  duration: '1m',
  thresholds: {
    http_req_duration: ['p(95)<1500'],
    'http_req_duration{route:documents}': ['p(95)<1500'],
    'http_req_duration{route:signals}': ['p(95)<1500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = 'http://localhost:3000';

const headers = {
  Authorization: `Bearer ${__ENV.ACCESS_TOKEN}`,
  'x-dev-bypass': 'true',
};

export default function () {
  const isDocuments = Math.random() < 0.5;
  const url = isDocuments
    ? `${BASE_URL}/api/exhibitor/documents`
    : `${BASE_URL}/api/signals`;

  const tags = { route: isDocuments ? 'documents' : 'signals' };
  const res = http.get(url, { headers, tags });

  check(res, {
    'status is 200': (r) => r.status === 200,
  });

  sleep(1);
}
