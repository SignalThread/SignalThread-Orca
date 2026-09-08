import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Endpoint overrides for local/dev environments
const LEAD_CREATE_PATH = __ENV.LEAD_CREATE_PATH || '/api/exhibitor/leads';
const VOICE_SIGNED_URL_PATH = __ENV.VOICE_SIGNED_URL_PATH || '/api/conversations/upload/signed-url';
const VOICE_FINALIZE_PATH = __ENV.VOICE_FINALIZE_PATH || '/api/conversations/upload/finalize';
const DOCUMENTS_PATH = __ENV.DOCUMENTS_PATH || '/api/exhibitor/documents';
const SIGNALS_PATH = __ENV.SIGNALS_PATH || '/api/signals';
const CAMPAIGNS_PATH = __ENV.CAMPAIGNS_PATH || '/api/campaigns';

// Seed values (override via env as needed)
const LEAD_ID = __ENV.LEAD_ID || 'c0b151c9-4194-475a-bdeb-2b4a9318136d';
const EVENT_ID = __ENV.EVENT_ID || '';
const AUDIO_FIXTURE_PATH = __ENV.AUDIO_FIXTURE_PATH || './load-tests/fixtures/voice-fixture.m4a';
const AUDIO_CONTENT_TYPE = __ENV.AUDIO_CONTENT_TYPE || 'audio/m4a';
const ACCESS_TOKEN = __ENV.ACCESS_TOKEN || '';

const audioBytes = open(AUDIO_FIXTURE_PATH, 'b');

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

const sharedHeaders = {
  'x-dev-bypass': 'true'
};
if (ACCESS_TOKEN) {
  sharedHeaders.Authorization = `Bearer ${ACCESS_TOKEN}`;
}

const readEndpoints = [
  { path: DOCUMENTS_PATH, tag: 'documents_read' },
  { path: SIGNALS_PATH, tag: 'signals_read' },
  { path: CAMPAIGNS_PATH, tag: 'campaigns_read' }
];

export const options = {
  scenarios: {
    event_spike_mixed: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },
        { duration: '1m', target: 100 },
        { duration: '15s', target: 0 }
      ],
      gracefulRampDown: '10s'
    }
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000']
  }
};

function randomInt(maxExclusive) {
  return Math.floor(Math.random() * maxExclusive);
}

function pick(list) {
  return list[randomInt(list.length)];
}

function randomDateYYYYMMDD(daysAheadMax = 21) {
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

function runLeadCreate() {
  const res = http.post(
    `${BASE_URL}${LEAD_CREATE_PATH}`,
    JSON.stringify(buildLeadPayload()),
    {
      headers: {
        ...sharedHeaders,
        'Content-Type': 'application/json'
      },
      tags: { flow: 'lead_create', endpoint: 'lead_create_post' }
    }
  );

  check(res, {
    'lead create status is 200 or 201': (r) => r.status === 200 || r.status === 201
  });
}

function runVoiceUpload() {
  const signedUrlRes = http.post(
    `${BASE_URL}${VOICE_SIGNED_URL_PATH}`,
    JSON.stringify({
      leadId: LEAD_ID,
      contentType: AUDIO_CONTENT_TYPE
    }),
    {
      headers: {
        ...sharedHeaders,
        'Content-Type': 'application/json'
      },
      tags: { flow: 'voice_upload', endpoint: 'voice_upload_signed_url' }
    }
  );

  let signedUrlJson = null;
  try {
    signedUrlJson = signedUrlRes.json();
  } catch {
    signedUrlJson = null;
  }

  check(signedUrlRes, {
    'voice signed-url status is 200': (r) => r.status === 200,
    'voice signed-url has uploadUrl': () => Boolean(signedUrlJson && signedUrlJson.uploadUrl),
    'voice signed-url has storagePath': () => Boolean(signedUrlJson && signedUrlJson.storagePath)
  });

  if (!signedUrlJson || !signedUrlJson.uploadUrl || !signedUrlJson.storagePath) {
    return;
  }

  const uploadRes = http.put(signedUrlJson.uploadUrl, audioBytes, {
    headers: {
      ...(signedUrlJson.uploadHeaders || {}),
      'Content-Type': AUDIO_CONTENT_TYPE
    },
    tags: { flow: 'voice_upload', endpoint: 'voice_upload_direct_r2_put' }
  });

  check(uploadRes, {
    'voice direct upload status is 200/201/204': (r) => [200, 201, 204].includes(r.status)
  });

  if (![200, 201, 204].includes(uploadRes.status)) {
    return;
  }

  const finalizeRes = http.post(
    `${BASE_URL}${VOICE_FINALIZE_PATH}`,
    JSON.stringify({
      leadId: LEAD_ID,
      storagePath: signedUrlJson.storagePath,
      contentType: AUDIO_CONTENT_TYPE
    }),
    {
      headers: {
        ...sharedHeaders,
        'Content-Type': 'application/json'
      },
      tags: { flow: 'voice_upload', endpoint: 'voice_upload_finalize' }
    }
  );

  let json = null;
  try {
    json = finalizeRes.json();
  } catch {
    json = null;
  }

  check(finalizeRes, {
    'voice finalize status is 200': (r) => r.status === 200,
    'voice upload response success=true': () => Boolean(json && json.success === true)
  });
}

function runReadTraffic() {
  const endpoint = pick(readEndpoints);
  const res = http.get(`${BASE_URL}${endpoint.path}`, {
    headers: sharedHeaders,
    tags: { flow: 'reads', endpoint: endpoint.tag }
  });

  check(res, {
    'read status is 200': (r) => r.status === 200
  });
}

export default function () {
  // Weighted mix: 60% leads, 25% voice uploads, 15% reads
  const roll = Math.random();

  if (roll < 0.60) {
    runLeadCreate();
  } else if (roll < 0.85) {
    runVoiceUpload();
  } else {
    runReadTraffic();
  }

  sleep(Math.random() * 0.3);
}
