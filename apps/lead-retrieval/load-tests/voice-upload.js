import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const DEV_BYPASS = 'true';

const LEAD_LOOKUP_URL = `${BASE_URL}/api/exhibitor/leads`;
const SIGNED_URL_PATH = __ENV.SIGNED_URL_PATH || '/api/conversations/upload/signed-url';
const FINALIZE_PATH = __ENV.FINALIZE_PATH || '/api/conversations/upload/finalize';
const CONTENT_TYPE = __ENV.CONTENT_TYPE || 'audio/m4a';

const fixtureCandidates = [];
if ((__ENV.AUDIO_FIXTURE_PATH || '').trim()) {
  fixtureCandidates.push(__ENV.AUDIO_FIXTURE_PATH.trim());
}
fixtureCandidates.push('./load-tests/fixtures/voice-fixture.m4a');
fixtureCandidates.push('load-tests/fixtures/voice-fixture.m4a');
fixtureCandidates.push('./fixtures/voice-fixture.m4a');

function resolveAudioFixture() {
  const tried = [];

  for (const candidate of fixtureCandidates) {
    tried.push(candidate);
    try {
      const bytes = open(candidate, 'b');
      if (!bytes || bytes.byteLength <= 0) {
        throw new Error('fixture is empty');
      }
      return { bytes, path: candidate };
    } catch (_) {
      // Try next candidate path.
    }
  }

  throw new Error(`[voice-upload] Fixture file missing. Tried: ${tried.join(', ')}`);
}

const fixture = resolveAudioFixture();
const audioFile = fixture.bytes;

export const options = {
  discardResponseBodies: false,
  scenarios: {
    direct_voice_upload: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 25 },
        { duration: '1m', target: 25 },
        { duration: '30s', target: 50 },
        { duration: '1m', target: 50 },
        { duration: '30s', target: 75 },
        { duration: '1m', target: 75 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    finalize_duration: ['p(95)<2000'],
    lead_lookup_failed: ['rate<0.01'],
    signed_url_failed: ['rate<0.01'],
    upload_failed: ['rate<0.01'],
    finalize_failed: ['rate<0.01'],
  },
};

const leadLookupDuration = new Trend('lead_lookup_duration', true);
const signedUrlDuration = new Trend('signed_url_duration', true);
const uploadDuration = new Trend('upload_duration', true);
const finalizeDuration = new Trend('finalize_duration', true);

const leadLookupFailed = new Rate('lead_lookup_failed');
const signedUrlFailed = new Rate('signed_url_failed');
const uploadFailed = new Rate('upload_failed');
const finalizeFailed = new Rate('finalize_failed');

function authHeaders() {
  return {
    'x-dev-bypass': DEV_BYPASS,
  };
}

function jsonHeaders() {
  return {
    ...authHeaders(),
    'Content-Type': 'application/json',
  };
}

function safeJson(res) {
  try {
    return res.json();
  } catch {
    return null;
  }
}

function formatBody(body) {
  const raw = String(body || '').replace(/\s+/g, ' ').trim();
  if (raw.length <= 300) return raw;
  return `${raw.slice(0, 300)}...`;
}

function parseJsonResponseOrThrow(response, url, stage) {
  const contentType = String(response.headers['Content-Type'] || response.headers['content-type'] || '').trim();
  const bodySnippet = formatBody(response.body);

  if (response.status !== 200) {
    throw new Error(
      `[${stage}] non-200 response url=${url} status=${response.status} content-type=${contentType || 'missing'} body=${bodySnippet}`
    );
  }

  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(
      `[${stage}] non-JSON response url=${url} status=${response.status} content-type=${contentType || 'missing'} body=${bodySnippet}`
    );
  }

  try {
    return response.json();
  } catch {
    throw new Error(
      `[${stage}] invalid JSON response url=${url} status=${response.status} content-type=${contentType || 'missing'} body=${bodySnippet}`
    );
  }
}

function resolveLeadId() {
  const response = http.get(LEAD_LOOKUP_URL, {
    headers: authHeaders(),
    tags: { stage: 'lead-lookup', name: 'voice_lead_lookup' },
    timeout: '30s',
  });

  leadLookupDuration.add(response.timings.duration);

  let body = null;
  try {
    body = parseJsonResponseOrThrow(response, LEAD_LOOKUP_URL, 'lead-lookup');
  } catch (error) {
    leadLookupFailed.add(1);
    throw error;
  }

  const leadId = String(body?.leadId || body?.leads?.[0]?.id || '').trim();

  if (!leadId) {
    leadLookupFailed.add(1);
    throw new Error(
      `[lead-lookup] missing leadId in JSON response url=${LEAD_LOOKUP_URL} status=${response.status} content-type=application/json body=${formatBody(response.body)}`
    );
  }

  leadLookupFailed.add(0);
  return leadId;
}

export function setup() {
  if (!audioFile || audioFile.byteLength <= 0) {
    throw new Error(`[voice-upload][setup] Fixture missing or empty at path=${fixture.path}`);
  }

  const leadId = resolveLeadId();

  console.log(`[voice-upload][setup] using lead lookup URL: ${LEAD_LOOKUP_URL}`);
  console.log(`[voice-upload][setup] resolved leadId=${leadId} fixturePath=${fixture.path}`);

  return {
    leadId,
    fixturePath: fixture.path,
  };
}

export default function (setupData) {
  const leadId = String(setupData?.leadId || '').trim();
  if (!leadId) {
    throw new Error('[voice-upload] setup() did not provide a valid leadId');
  }

  const signedUrlRes = http.post(
    `${BASE_URL}${SIGNED_URL_PATH}`,
    JSON.stringify({
      leadId,
      contentType: CONTENT_TYPE,
    }),
    {
      headers: jsonHeaders(),
      tags: { stage: 'signed-url', name: 'voice_signed_url' },
      timeout: '30s',
    }
  );

  signedUrlDuration.add(signedUrlRes.timings.duration);

  if (signedUrlRes.status !== 200) {
    signedUrlFailed.add(1);
    console.error(
      `[signed-url] status=${signedUrlRes.status} body=${formatBody(signedUrlRes.body)}`
    );
    return;
  }

  signedUrlFailed.add(0);

  const signedUrlBody = safeJson(signedUrlRes);
  const uploadUrl = String(signedUrlBody?.uploadUrl || '').trim();
  const storagePath = String(signedUrlBody?.storagePath || '').trim();

  if (!uploadUrl || !storagePath) {
    signedUrlFailed.add(1);
    console.error(`[signed-url] invalid response body=${formatBody(signedUrlRes.body)}`);
    return;
  }

  const uploadHeaders = {
    ...(signedUrlBody?.uploadHeaders || {}),
    'Content-Type': CONTENT_TYPE,
  };

  const uploadRes = http.put(uploadUrl, audioFile, {
    headers: uploadHeaders,
    tags: { stage: 'upload', name: 'voice_r2_upload' },
    timeout: '2m',
  });

  uploadDuration.add(uploadRes.timings.duration);

  if (![200, 201, 204].includes(uploadRes.status)) {
    uploadFailed.add(1);
    console.error(
      `[upload] status=${uploadRes.status} storagePath=${storagePath} body=${formatBody(uploadRes.body)}`
    );
    return;
  }

  uploadFailed.add(0);

  const finalizeRes = http.post(
    `${BASE_URL}${FINALIZE_PATH}`,
    JSON.stringify({
      leadId,
      storagePath,
      contentType: CONTENT_TYPE,
    }),
    {
      headers: jsonHeaders(),
      tags: { stage: 'finalize', name: 'voice_finalize' },
      timeout: '30s',
    }
  );

  finalizeDuration.add(finalizeRes.timings.duration);

  const finalizeBody = safeJson(finalizeRes);
  const finalizeOk = check(finalizeRes, {
    'finalize status is 200': (r) => r.status === 200,
    'finalize success true': () =>
      Boolean(finalizeBody?.success === true && finalizeBody?.transcriptionStatus === 'pending'),
  });

  if (!finalizeOk) {
    finalizeFailed.add(1);
    console.error(
      `[finalize] status=${finalizeRes.status} storagePath=${storagePath} body=${formatBody(finalizeRes.body)}`
    );
    return;
  }

  finalizeFailed.add(0);

  sleep(1);
}

export function handleSummary(data) {
  return {
    stdout: [
      '',
      '=== DIRECT VOICE UPLOAD SUMMARY ===',
      `fixture_path: ${fixture.path}`,
      `lead_lookup_duration p(95): ${data.metrics.lead_lookup_duration?.values?.['p(95)'] ?? 'n/a'}ms`,
      `signed_url_duration p(95): ${data.metrics.signed_url_duration?.values?.['p(95)'] ?? 'n/a'}ms`,
      `upload_duration p(95): ${data.metrics.upload_duration?.values?.['p(95)'] ?? 'n/a'}ms`,
      `finalize_duration p(95): ${data.metrics.finalize_duration?.values?.['p(95)'] ?? 'n/a'}ms`,
      `lead_lookup_failed rate: ${data.metrics.lead_lookup_failed?.values?.rate ?? 'n/a'}`,
      `signed_url_failed rate: ${data.metrics.signed_url_failed?.values?.rate ?? 'n/a'}`,
      `upload_failed rate: ${data.metrics.upload_failed?.values?.rate ?? 'n/a'}`,
      `finalize_failed rate: ${data.metrics.finalize_failed?.values?.rate ?? 'n/a'}`,
      '',
    ].join('\n'),
  };
}
