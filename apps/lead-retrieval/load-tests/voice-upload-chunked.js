import http from 'k6/http';
import { check } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const DEV_BYPASS = (__ENV.DEV_BYPASS || 'true').trim().toLowerCase() === 'true' ? 'true' : 'false';
const CONTENT_TYPE = __ENV.CONTENT_TYPE || 'audio/m4a';
const CHUNK_DURATION_SECONDS = Number(__ENV.CHUNK_DURATION_SECONDS || 8);
const MAX_CHUNK_RETRIES = Number(__ENV.MAX_CHUNK_RETRIES || 3);
const INTERRUPT_AFTER_CHUNKS = Number(__ENV.INTERRUPT_AFTER_CHUNKS || 0);
const SIMULATED_FILE_BYTES = Number(__ENV.SIMULATED_FILE_BYTES || 0);

const LEAD_LOOKUP_URL = `${BASE_URL}/api/exhibitor/leads`;
const CREATE_SESSION_URL = `${BASE_URL}/api/conversations/upload/chunked/session`;
const CHUNK_URLS_URL = `${BASE_URL}/api/conversations/upload/chunked/chunk-urls`;
const COMPLETE_URL = `${BASE_URL}/api/conversations/upload/chunked/complete`;
const ABORT_URL = `${BASE_URL}/api/conversations/upload/chunked/abort`;

const fixtureCandidates = [];
if ((__ENV.AUDIO_FIXTURE_PATH || '').trim()) {
  fixtureCandidates.push(__ENV.AUDIO_FIXTURE_PATH.trim());
}
fixtureCandidates.push('./load-tests/fixtures/voice-fixture.m4a');
fixtureCandidates.push('load-tests/fixtures/voice-fixture.m4a');
fixtureCandidates.push('./fixtures/voice-fixture.m4a');

const leadLookupDuration = new Trend('lead_lookup_duration', true);
const createSessionDuration = new Trend('create_session_duration', true);
const chunkUrlDuration = new Trend('chunk_url_duration', true);
const chunkUploadDuration = new Trend('chunk_upload_duration', true);
const resumeSyncDuration = new Trend('resume_sync_duration', true);
const completeDuration = new Trend('complete_duration', true);
const abortDuration = new Trend('abort_duration', true);

const leadLookupFailed = new Rate('lead_lookup_failed');
const createSessionFailed = new Rate('create_session_failed');
const chunkUrlsFailed = new Rate('chunk_urls_failed');
const chunkUploadFailed = new Rate('chunk_upload_failed');
const completeFailed = new Rate('complete_failed');
const abortFailed = new Rate('abort_failed');

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

  throw new Error(`[voice-upload-chunked] Fixture file missing. Tried: ${tried.join(', ')}`);
}

const fixture = resolveAudioFixture();
const fullAudioBytes = fixture.bytes;
const audioBytes =
  Number.isFinite(SIMULATED_FILE_BYTES) &&
    SIMULATED_FILE_BYTES > 0 &&
    SIMULATED_FILE_BYTES < fullAudioBytes.byteLength
    ? fullAudioBytes.slice(0, Math.floor(SIMULATED_FILE_BYTES))
    : fullAudioBytes;

export const options = {
  discardResponseBodies: false,
  scenarios: {
    chunked_voice_upload_concurrent: {
      executor: 'per-vu-iterations',
      vus: 250,
      iterations: 1,
      maxDuration: '10m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    complete_duration: ['p(95)<2000'],
    lead_lookup_failed: ['rate<0.01'],
    create_session_failed: ['rate<0.01'],
    chunk_urls_failed: ['rate<0.01'],
    chunk_upload_failed: ['rate<0.01'],
    complete_failed: ['rate<0.01'],
  },
};

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

function buildChunkIndexes(totalParts) {
  return Array.from({ length: Math.max(0, totalParts) }, (_, i) => i);
}

function buildChunkByteRange(chunkIndex, chunkSizeBytes, fileSize) {
  const start = chunkIndex * chunkSizeBytes;
  const endExclusive = Math.min(start + chunkSizeBytes, fileSize);
  return { start, endExclusive };
}

function partNumberFromChunkIndex(chunkIndex) {
  return chunkIndex + 1;
}

function extractEtagFromHeaders(headers) {
  const raw = headers?.ETag || headers?.Etag || headers?.etag || null;
  if (Array.isArray(raw)) {
    return String(raw[0] || '').replace(/^"+|"+$/g, '').trim() || null;
  }
  return String(raw || '').replace(/^"+|"+$/g, '').trim() || null;
}

function createEmptyManifest(totalParts) {
  return buildChunkIndexes(totalParts).map((chunkIndex) => ({
    chunkIndex,
    partNumber: partNumberFromChunkIndex(chunkIndex),
    etag: null,
    status: 'pending',
    attempts: 0,
  }));
}

function getManifestEntry(manifest, chunkIndex) {
  return manifest.find((entry) => entry.chunkIndex === chunkIndex);
}

function getPendingChunkIndexes(manifest) {
  return manifest
    .filter((entry) => entry.status !== 'uploaded')
    .map((entry) => entry.chunkIndex)
    .sort((a, b) => a - b);
}

function toOrderedChunkManifest(manifest) {
  return [...manifest]
    .filter((entry) => entry.status === 'uploaded' && entry.etag)
    .sort((a, b) => a.partNumber - b.partNumber)
    .map((entry) => ({
      chunkIndex: entry.chunkIndex,
      partNumber: entry.partNumber,
      etag: entry.etag,
    }));
}

function requestChunkUrls(leadId, storagePath, uploadId, chunkIndexes) {
  const response = http.post(
    CHUNK_URLS_URL,
    JSON.stringify({
      leadId,
      storagePath,
      uploadId,
      chunkIndexes,
    }),
    {
      headers: jsonHeaders(),
      tags: { stage: 'chunk-urls', name: 'rolling_chunk_urls' },
      timeout: '30s',
    }
  );

  chunkUrlDuration.add(response.timings.duration);

  try {
    const body = parseJsonResponseOrThrow(response, CHUNK_URLS_URL, 'chunk-urls');
    chunkUrlsFailed.add(0);
    return body;
  } catch (error) {
    chunkUrlsFailed.add(1);
    throw error;
  }
}

function requestAbortCleanup(leadId, storagePath, uploadId, reason) {
  const response = http.post(
    ABORT_URL,
    JSON.stringify({
      leadId,
      storagePath,
      uploadId,
      reason,
    }),
    {
      headers: jsonHeaders(),
      tags: { stage: 'abort', name: 'rolling_abort_cleanup' },
      timeout: '30s',
    }
  );

  abortDuration.add(response.timings.duration);
  const body = safeJson(response);
  const ok = response.status === 200 && body?.success === true;
  abortFailed.add(ok ? 0 : 1);
  if (!ok) {
    console.error(
      `[abort] status=${response.status} storagePath=${storagePath} uploadId=${uploadId} body=${formatBody(response.body)}`
    );
  }
  return ok;
}

function syncManifestFromServer(manifest, uploadedParts) {
  for (const part of uploadedParts || []) {
    const partNumber = Number(part?.partNumber || 0);
    if (!partNumber) continue;
    const chunkIndex = partNumber - 1;
    const etag = String(part?.etag || '').replace(/^"+|"+$/g, '').trim() || null;
    const entry = getManifestEntry(manifest, chunkIndex);
    if (!entry) continue;
    entry.status = 'uploaded';
    if (etag) {
      entry.etag = etag;
    }
  }
}

function resolveLeadIdOnce() {
  const response = http.get(LEAD_LOOKUP_URL, {
    headers: authHeaders(),
    tags: { stage: 'lead-lookup', name: 'rolling_voice_lead_lookup' },
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
      `[lead-lookup] missing leadId in JSON response url=${LEAD_LOOKUP_URL} status=${response.status} body=${formatBody(response.body)}`
    );
  }

  leadLookupFailed.add(0);
  return leadId;
}

export function setup() {
  if (!audioBytes || audioBytes.byteLength <= 0) {
    throw new Error(`[voice-upload-chunked][setup] Fixture missing or empty at path=${fixture.path}`);
  }

  const leadId = resolveLeadIdOnce();
  console.log(`[voice-upload-chunked][setup] leadId=${leadId} fixturePath=${fixture.path} fileSize=${audioBytes.byteLength}`);

  return {
    leadId,
    fixturePath: fixture.path,
    fileSize: audioBytes.byteLength,
  };
}

export default function (setupData) {
  const leadId = String(setupData?.leadId || '').trim();
  if (!leadId) {
    throw new Error('[voice-upload-chunked] setup() did not provide leadId');
  }

  const createSessionRes = http.post(
    CREATE_SESSION_URL,
    JSON.stringify({
      leadId,
      contentType: CONTENT_TYPE,
      fileSize: audioBytes.byteLength,
      chunkDurationSeconds: CHUNK_DURATION_SECONDS,
    }),
    {
      headers: jsonHeaders(),
      tags: { stage: 'create-session', name: 'rolling_create_session' },
      timeout: '30s',
    }
  );
  createSessionDuration.add(createSessionRes.timings.duration);

  let createSessionBody = null;
  try {
    createSessionBody = parseJsonResponseOrThrow(createSessionRes, CREATE_SESSION_URL, 'create-session');
  } catch (error) {
    createSessionFailed.add(1);
    console.error(String(error));
    return;
  }
  createSessionFailed.add(0);

  const session = createSessionBody?.session || {};
  const storagePath = String(session.storagePath || '').trim();
  const finalKey = storagePath;
  const uploadId = String(session.uploadId || '').trim();
  const chunkSizeBytes = Number(session.chunkSizeBytes || 0);
  const totalParts = Number(session.totalParts || 0);

  if (!storagePath || !uploadId || !chunkSizeBytes || !totalParts) {
    createSessionFailed.add(1);
    console.error(`[create-session] invalid response body=${formatBody(createSessionRes.body)}`);
    return;
  }

  let state = {
    leadId,
    storagePath,
    uploadId,
    chunkSizeBytes,
    totalParts,
    manifest: createEmptyManifest(totalParts),
  };

  let pendingChunkIndexes = getPendingChunkIndexes(state.manifest);
  if (pendingChunkIndexes.length === 0) {
    chunkUploadFailed.add(0);
  }

  for (const chunkIndex of pendingChunkIndexes) {
    const entry = getManifestEntry(state.manifest, chunkIndex);
    if (!entry || entry.status === 'uploaded') {
      continue;
    }

    let uploaded = false;
    for (let attempt = 1; attempt <= MAX_CHUNK_RETRIES; attempt += 1) {
      let chunkUrlsBody;
      try {
        chunkUrlsBody = requestChunkUrls(leadId, storagePath, uploadId, [chunkIndex]);
      } catch (error) {
        if (attempt === MAX_CHUNK_RETRIES) {
          entry.status = 'failed';
          console.error(`[chunk-urls] chunkIndex=${chunkIndex} exhausted retries error=${String(error)}`);
          break;
        }
        continue;
      }

      syncManifestFromServer(state.manifest, chunkUrlsBody.uploadedParts);
      if (entry.status === 'uploaded') {
        uploaded = true;
        break;
      }

      const urlItem = (chunkUrlsBody.chunkUploadUrls || []).find(
        (item) => Number(item.partNumber) === entry.partNumber
      );
      const uploadUrl = String(urlItem?.uploadUrl || '').trim();
      if (!uploadUrl) {
        if (attempt === MAX_CHUNK_RETRIES) {
          entry.status = 'failed';
          console.error(`[chunk-upload] missing upload URL for chunkIndex=${chunkIndex}`);
          break;
        }
        continue;
      }

      const { start, endExclusive } = buildChunkByteRange(chunkIndex, chunkSizeBytes, audioBytes.byteLength);
      const chunkPayload = audioBytes.slice(start, endExclusive);
      const uploadRes = http.put(uploadUrl, chunkPayload, {
        headers: {
          ...(urlItem?.uploadHeaders || {}),
          'Content-Type': CONTENT_TYPE,
        },
        tags: { stage: 'chunk-upload', name: 'rolling_chunk_upload' },
        timeout: '30s',
      });
      chunkUploadDuration.add(uploadRes.timings.duration);

      entry.attempts = Math.max(entry.attempts, attempt);
      if ([200, 201, 204].includes(uploadRes.status)) {
        entry.status = 'uploaded';
        entry.etag = extractEtagFromHeaders(uploadRes.headers);
        uploaded = true;
        break;
      }

      if (attempt === MAX_CHUNK_RETRIES) {
        entry.status = 'failed';
        console.error(
          `[chunk-upload] chunkIndex=${chunkIndex} part=${entry.partNumber} attempts=${attempt} status=${uploadRes.status} body=${formatBody(uploadRes.body)}`
        );
        break;
      }
    }

    if (!uploaded) {
      console.error(`[chunk-upload] chunkIndex=${chunkIndex} failed without successful retry`);
      continue;
    }

    if (INTERRUPT_AFTER_CHUNKS > 0) {
      const uploadedCount = state.manifest.filter((item) => item.status === 'uploaded').length;
      if (uploadedCount === INTERRUPT_AFTER_CHUNKS) {
        const serializedState = JSON.stringify(state);
        state = JSON.parse(serializedState);

        const resumeSyncStart = Date.now();
        const resumeChunkIndexes = getPendingChunkIndexes(state.manifest);
        if (resumeChunkIndexes.length > 0) {
          try {
            const resumeBody = requestChunkUrls(leadId, storagePath, uploadId, resumeChunkIndexes);
            syncManifestFromServer(state.manifest, resumeBody.uploadedParts);
          } catch (error) {
            console.error(`[resume-sync] ${String(error)}`);
            break;
          }
        }
        resumeSyncDuration.add(Date.now() - resumeSyncStart);
      }
    }
  }

  const finalPendingChunkIndexes = getPendingChunkIndexes(state.manifest);
  let skipCompleteReason = '';
  if (finalPendingChunkIndexes.length > 0) {
    try {
      const finalSyncBody = requestChunkUrls(leadId, storagePath, uploadId, finalPendingChunkIndexes);
      syncManifestFromServer(state.manifest, finalSyncBody.uploadedParts);
    } catch (error) {
      skipCompleteReason = `final_sync_failed:${String(error)}`;
    }
  }

  const orderedChunkManifest = toOrderedChunkManifest(state.manifest);
  const successfulPartNumbers = orderedChunkManifest.map((item) => item.partNumber);
  const allPartsUploaded = successfulPartNumbers.length === totalParts;
  const expectedPartCount = totalParts;
  const completeCalled = allPartsUploaded;

  if (!allPartsUploaded) {
    chunkUploadFailed.add(1);
    if (!skipCompleteReason) {
      skipCompleteReason = 'incomplete_parts';
    }
    console.log(
      `[chunked-flow] expectedPartCount=${expectedPartCount} successfulPartNumbers=${JSON.stringify(successfulPartNumbers)} completeCalled=${completeCalled} skipCompleteReason=${skipCompleteReason}`
    );
    requestAbortCleanup(leadId, storagePath, uploadId, skipCompleteReason);
    completeFailed.add(1);
    return;
  }

  chunkUploadFailed.add(0);
  console.log(
    `[chunked-flow] expectedPartCount=${expectedPartCount} successfulPartNumbers=${JSON.stringify(successfulPartNumbers)} completeCalled=${completeCalled} skipCompleteReason=`
  );

  const completeRes = http.post(
    COMPLETE_URL,
    JSON.stringify({
      leadId,
      storagePath,
      uploadId,
      totalParts,
      contentType: CONTENT_TYPE,
      chunkManifest: orderedChunkManifest,
    }),
    {
      headers: jsonHeaders(),
      tags: { stage: 'complete', name: 'rolling_complete' },
      timeout: '30s',
    }
  );
  completeDuration.add(completeRes.timings.duration);

  const completeBody = safeJson(completeRes);
  const responseKey = String(
    completeBody?.key ??
    completeBody?.objectKey ??
    completeBody?.filePath ??
    completeBody?.storageKey ??
    completeBody?.storagePath ??
    ''
  ).trim();
  const completeOk = check(completeRes, {
    'complete status is 200': (r) => r.status === 200,
    'complete success true': () =>
      Boolean(completeBody?.success === true && completeBody?.transcriptionStatus === 'pending'),
  });

  if (!completeOk) {
    completeFailed.add(1);
    console.error(
      `[complete] status=${completeRes.status} storagePath=${storagePath} body=${formatBody(completeRes.body)}`
    );
    console.log(`[UPLOAD_KEY_CLIENT] ${finalKey}`);
    console.log(`[UPLOAD_KEY_SERVER] ${responseKey}`);
    if (!responseKey) {
      console.log(`[COMPLETE_RESPONSE] ${completeRes.body}`);
    }
    return;
  }

  completeFailed.add(0);
  console.log(`[UPLOAD_KEY_CLIENT] ${finalKey}`);
  console.log(`[UPLOAD_KEY_SERVER] ${responseKey}`);
  if (!responseKey) {
    console.log(`[COMPLETE_RESPONSE] ${completeRes.body}`);
  }
}

export function handleSummary(data) {
  return {
    stdout: [
      '',
      '=== ROLLING CHUNKED VOICE UPLOAD SUMMARY ===',
      `fixture_path: ${fixture.path}`,
      `lead_lookup_duration p(95): ${data.metrics.lead_lookup_duration?.values?.['p(95)'] ?? 'n/a'}ms`,
      `create_session_duration p(95): ${data.metrics.create_session_duration?.values?.['p(95)'] ?? 'n/a'}ms`,
      `chunk_url_duration p(95): ${data.metrics.chunk_url_duration?.values?.['p(95)'] ?? 'n/a'}ms`,
      `chunk_upload_duration p(95): ${data.metrics.chunk_upload_duration?.values?.['p(95)'] ?? 'n/a'}ms`,
      `resume_sync_duration p(95): ${data.metrics.resume_sync_duration?.values?.['p(95)'] ?? 'n/a'}ms`,
      `complete_duration p(95): ${data.metrics.complete_duration?.values?.['p(95)'] ?? 'n/a'}ms`,
      `lead_lookup_failed rate: ${data.metrics.lead_lookup_failed?.values?.rate ?? 'n/a'}`,
      `create_session_failed rate: ${data.metrics.create_session_failed?.values?.rate ?? 'n/a'}`,
      `chunk_urls_failed rate: ${data.metrics.chunk_urls_failed?.values?.rate ?? 'n/a'}`,
      `chunk_upload_failed rate: ${data.metrics.chunk_upload_failed?.values?.rate ?? 'n/a'}`,
      `complete_failed rate: ${data.metrics.complete_failed?.values?.rate ?? 'n/a'}`,
      `abort_duration p(95): ${data.metrics.abort_duration?.values?.['p(95)'] ?? 'n/a'}ms`,
      `abort_failed rate: ${data.metrics.abort_failed?.values?.rate ?? 'n/a'}`,
      '',
    ].join('\n'),
  };
}
