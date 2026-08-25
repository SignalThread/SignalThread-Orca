#!/usr/bin/env node
import assert from "node:assert/strict";

const BASE_URL = process.env.BASE_URL?.trim() || "http://127.0.0.1:3000";
const EVENT_ID = process.env.EVENT_ID?.trim();
const COOKIE = process.env.AUTH_COOKIE?.trim() || "";

if (!EVENT_ID) {
  console.error("Missing EVENT_ID. Usage:");
  console.error("  EVENT_ID=<uuid> AUTH_COOKIE='<cookie>' node scripts/smoke-budget-files.mjs");
  process.exit(1);
}

const headers = {
  "content-type": "application/json",
  ...(COOKIE ? { cookie: COOKIE } : {}),
};

async function jsonFetch(url, init = {}) {
  const response = await fetch(url, init);
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  return { response, payload };
}

async function run() {
  const filename = `budget-smoke-${Date.now()}.csv`;
  const fileBody = "Category,Subcategory,Line Item,Forecast\nF&B,Catering,Smoke Test,1000\n";
  const fileSizeBytes = Buffer.byteLength(fileBody);

  console.info("[smoke-budget-files] presign");
  const presignResult = await jsonFetch(
    `${BASE_URL}/api/events/${encodeURIComponent(EVENT_ID)}/budget/files/presign`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        filename,
        contentType: "text/csv",
        fileSizeBytes,
      }),
    },
  );

  assert.equal(presignResult.response.status, 200, `presign failed: ${JSON.stringify(presignResult.payload)}`);
  assert.ok(presignResult.payload.documentId, "presign missing documentId");
  assert.ok(presignResult.payload.uploadUrl, "presign missing uploadUrl");
  assert.ok(presignResult.payload.objectKey, "presign missing objectKey");

  console.info("[smoke-budget-files] upload");
  const uploadResponse = await fetch(presignResult.payload.uploadUrl, {
    method: String(presignResult.payload.method || "PUT"),
    headers: {
      "content-type": "text/csv",
      ...(presignResult.payload.headers || {}),
    },
    body: fileBody,
  });
  assert.equal(uploadResponse.ok, true, `upload failed: ${uploadResponse.status}`);
  const objectEtag = uploadResponse.headers.get("etag")?.replace(/"/g, "") || null;

  console.info("[smoke-budget-files] finalize");
  const finalizeResult = await jsonFetch(
    `${BASE_URL}/api/events/${encodeURIComponent(EVENT_ID)}/budget/files/${encodeURIComponent(presignResult.payload.documentId)}/finalize-upload`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        objectKey: presignResult.payload.objectKey,
        objectEtag,
        mimeType: "text/csv",
        fileSizeBytes,
        originalFilename: filename,
      }),
    },
  );
  assert.equal(finalizeResult.response.status, 201, `finalize failed: ${JSON.stringify(finalizeResult.payload)}`);
  assert.ok(finalizeResult.payload.versionId, "finalize missing versionId");
  assert.ok(finalizeResult.payload.budgetFiles?.latestFile, "finalize missing latest budget file");

  console.info("[smoke-budget-files] list");
  const listResult = await jsonFetch(`${BASE_URL}/api/events/${encodeURIComponent(EVENT_ID)}/budget/files`, {
    method: "GET",
    headers: COOKIE ? { cookie: COOKIE } : {},
  });
  assert.equal(listResult.response.status, 200, `list failed: ${JSON.stringify(listResult.payload)}`);
  assert.ok(listResult.payload.latestFile, "list missing latest file");
  assert.ok(Array.isArray(listResult.payload.history), "list missing history");
  assert.ok(Array.isArray(listResult.payload.activity), "list missing activity");

  console.info("[smoke-budget-files] snapshot");
  const snapshotResult = await jsonFetch(`${BASE_URL}/api/events/${encodeURIComponent(EVENT_ID)}/budget`, {
    method: "GET",
    headers: COOKIE ? { cookie: COOKIE } : {},
  });
  assert.equal(snapshotResult.response.status, 200, `snapshot failed: ${JSON.stringify(snapshotResult.payload)}`);
  assert.ok(snapshotResult.payload.budgetFiles?.latestFile, "snapshot missing latest budget file");
  assert.ok(Array.isArray(snapshotResult.payload.budgetFiles?.history), "snapshot missing file history");

  console.info("[smoke-budget-files] download");
  const downloadResult = await jsonFetch(
    `${BASE_URL}/api/events/${encodeURIComponent(EVENT_ID)}/budget/files/${encodeURIComponent(
      String(listResult.payload.latestFile.documentId),
    )}/download`,
    {
      method: "GET",
      headers: COOKIE ? { cookie: COOKIE } : {},
    },
  );
  assert.equal(downloadResult.response.status, 200, `download failed: ${JSON.stringify(downloadResult.payload)}`);
  assert.ok(downloadResult.payload.url, "download missing URL");

  console.info("[smoke-budget-files] permission check");
  const unauthResult = await fetch(`${BASE_URL}/api/events/${encodeURIComponent(EVENT_ID)}/budget/files`, {
    method: "GET",
  });
  assert.equal(unauthResult.status >= 400, true, "unauthenticated request unexpectedly succeeded");

  console.info("[smoke-budget-files] all checks passed");
}

run().catch((error) => {
  console.error("[smoke-budget-files] failed", error);
  process.exit(1);
});
