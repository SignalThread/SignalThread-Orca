/* global __ENV */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const ACCESS_TOKEN = __ENV.ACCESS_TOKEN;

const headers = {
  'Content-Type': 'application/json',
  'x-dev-bypass': 'true',
  ...(ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {}),
};

export const options = {
  stages: [
    { duration: '20s', target: 50 },
    { duration: '20s', target: 100 },
    { duration: '20s', target: 150 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500'],
  },
};

export default function () {
  const endpoints = [
    { url: '/api/exhibitor/documents', tag: 'documents' },
    { url: '/api/campaigns', tag: 'campaigns' },
    { url: '/api/signals', tag: 'signals' },
  ];

  for (const ep of endpoints) {
    const res = http.get(`${BASE_URL}${ep.url}`, {
      headers,
      tags: { endpoint: ep.tag },
    });
    check(res, { [`${ep.tag} status 200`]: (r) => r.status === 200 });
  }

  sleep(1);
}