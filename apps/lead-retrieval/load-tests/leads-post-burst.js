import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const LEAD_CREATE_PATH = __ENV.LEAD_CREATE_PATH || '/api/exhibitor/leads';
const EVENT_ID = __ENV.EVENT_ID || '';

const FIRST_NAMES = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Riley', 'Casey', 'Avery', 'Skyler'];
const LAST_NAMES = ['Lee', 'Patel', 'Johnson', 'Brown', 'Nguyen', 'Garcia', 'Miller', 'Davis'];
const COMPANIES = [
  'Acme Corp',
  'Nimbus Labs',
  'Vertex Systems',
  'Summit Dynamics',
  'Blue Harbor',
  'Northstar Health',
  'Pioneer Logistics',
  'Brightline AI'
];
const TITLES = [
  'VP Marketing',
  'Director of Sales',
  'Head of Revenue Operations',
  'Senior Product Manager',
  'Demand Gen Manager',
  'Chief of Staff',
  'Partnerships Lead',
  'Solutions Engineer'
];
const STATUSES = ['new', 'follow_up'];

export const options = {
  scenarios: {
    leads_post_burst: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 150 },
        { duration: '1m', target: 150 },
        { duration: '15s', target: 0 }
      ],
      gracefulRampDown: '10s'
    }
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500']
  }
};

function randomInt(maxExclusive) {
  return Math.floor(Math.random() * maxExclusive);
}

function pick(list) {
  return list[randomInt(list.length)];
}

function randomDateYYYYMMDD(daysAheadMax = 14) {
  const now = new Date();
  now.setDate(now.getDate() + randomInt(daysAheadMax + 1));
  const yyyy = now.getFullYear();
  const mm = `${now.getMonth() + 1}`.padStart(2, '0');
  const dd = `${now.getDate()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function buildLeadPayload() {
  const firstName = pick(FIRST_NAMES);
  const lastName = pick(LAST_NAMES);
  const company = pick(COMPANIES);
  const uniq = `${Date.now()}-${__VU}-${__ITER}-${randomInt(1_000_000)}`;
  const emailLocal = `${firstName}.${lastName}.${uniq}`.toLowerCase().replace(/[^a-z0-9.]+/g, '');

  const payload = {
    full_name: `${firstName} ${lastName}`,
    email: `${emailLocal}@example.com`,
    job_title: pick(TITLES),
    company_text: company,
    priority_score: 30 + randomInt(70),
    status: pick(STATUSES),
    follow_up_date: randomDateYYYYMMDD(21)
  };

  if (EVENT_ID) {
    payload.event_id = EVENT_ID;
  }

  return payload;
}

export default function () {
  const payload = buildLeadPayload();

  const res = http.post(
    `${BASE_URL}${LEAD_CREATE_PATH}`,
    JSON.stringify(payload),
    {
      headers: {
        'Content-Type': 'application/json',
        'x-dev-bypass': 'true'
      },
      tags: { endpoint: 'leads_create' }
    }
  );

  check(res, {
    'status is 200 or 201': (r) => r.status === 200 || r.status === 201
  });
}
