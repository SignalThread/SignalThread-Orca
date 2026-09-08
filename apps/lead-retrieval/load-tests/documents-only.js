/* global __ENV */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export let options = {
  vus: 50,
  duration: '1m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500'],
  },
};

export default function () {
  let res = http.get(`${BASE_URL}/api/exhibitor/documents`, {
    headers: {
      'x-dev-bypass': 'true',
    },
    tags: { endpoint: 'documents' },
  });

  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(1);
}