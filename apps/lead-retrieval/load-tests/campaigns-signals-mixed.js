import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 300,
  duration: '1m',
  thresholds: {
    http_req_duration: ['p(95)<1500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = 'http://localhost:3000';

const headers = {
  Authorization: `Bearer ${__ENV.ACCESS_TOKEN}`,
  'x-dev-bypass': 'true',
};

export default function () {
  const route = Math.random() < 0.5
    ? `${BASE_URL}/api/campaigns`
    : `${BASE_URL}/api/signals`;

  const res = http.get(route, { headers });

  check(res, {
    'status is 200': (r) => r.status === 200,
  });

  sleep(1);
}
