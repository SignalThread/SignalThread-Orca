import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = 'http://localhost:3000';

export const options = {
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/exhibitor/leads/list`, {
    headers: {
      'x-dev-bypass': 'true',
    },
    tags: { endpoint: 'leads' },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
  });

  if (res.status !== 200) {
    console.log(`status=${res.status} body=${res.body}`);
  }

  sleep(1);
}