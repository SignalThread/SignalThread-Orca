import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = 'http://localhost:3000';
const ACCESS_TOKEN = 'PASTE_YOUR_TOKEN_HERE';

export const options = {
  vus: 150,
  duration: '1m',
};

const headers = {
  Authorization: `Bearer ${ACCESS_TOKEN}`,
  'x-dev-bypass': 'true',
};

export default function () {
  const res = http.get(`${BASE_URL}/api/signals`, { headers });

  check(res, {
    'status is 200': (r) => r.status === 200,
  });
};
